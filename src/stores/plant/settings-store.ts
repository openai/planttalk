import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// User-tunable timings, persisted to localStorage.

export const DEFAULT_OBSERVATION_INTERVAL_MS = 15 * 60_000; // 15 minutes — stays well inside free-tier API rate limits
export const DEFAULT_ARDUINO_CHECK_INTERVAL_MS = 1_000;

export const OBSERVATION_INTERVAL_LIMITS = {
  min: 5 * 60_000, // 5 minutes — safe floor for free-tier plans
  max: 30 * 60_000,
  step: 60_000,
};

export const ARDUINO_CHECK_INTERVAL_LIMITS = {
  min: 100,
  max: 60_000,
  step: 100,
};

interface PlantSettingsState {
  observationIntervalMs: number;
  arduinoCheckIntervalMs: number;
  setObservationIntervalMs: (value: number) => void;
  setArduinoCheckIntervalMs: (value: number) => void;
  resetSettings: () => void;
}

export const usePlantSettingsStore = create<PlantSettingsState>()(
  persist(
    (set) => ({
      observationIntervalMs: DEFAULT_OBSERVATION_INTERVAL_MS,
      arduinoCheckIntervalMs: DEFAULT_ARDUINO_CHECK_INTERVAL_MS,

      setObservationIntervalMs: (value) =>
        set({
          observationIntervalMs: normalizeSettingMs(value, OBSERVATION_INTERVAL_LIMITS),
        }),
      setArduinoCheckIntervalMs: (value) =>
        set({
          arduinoCheckIntervalMs: normalizeSettingMs(value, ARDUINO_CHECK_INTERVAL_LIMITS),
        }),
      resetSettings: () =>
        set({
          observationIntervalMs: DEFAULT_OBSERVATION_INTERVAL_MS,
          arduinoCheckIntervalMs: DEFAULT_ARDUINO_CHECK_INTERVAL_MS,
        }),
    }),
    {
      name: "plant-settings-store/v1",
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({
        observationIntervalMs: state.observationIntervalMs,
        arduinoCheckIntervalMs: state.arduinoCheckIntervalMs,
      }),
      version: 2,
      // v0 stored the observation cadence as chatGptIntervalMs — carry the
      // user's tuned value across the rename instead of resetting it.
      // v1→v2: raised minimum from 30s to 5min; clamp stale values.
      migrate: (persistedState: unknown, version: number) => {
        if (version < 1) {
          const legacy = persistedState as { chatGptIntervalMs?: number; arduinoCheckIntervalMs?: number } | undefined;
          return {
            observationIntervalMs: Math.max(
              legacy?.chatGptIntervalMs ?? DEFAULT_OBSERVATION_INTERVAL_MS,
              OBSERVATION_INTERVAL_LIMITS.min,
            ),
            arduinoCheckIntervalMs: legacy?.arduinoCheckIntervalMs ?? DEFAULT_ARDUINO_CHECK_INTERVAL_MS,
          };
        }
        if (version < 2) {
          const prev = persistedState as
            | { observationIntervalMs?: number; arduinoCheckIntervalMs?: number }
            | undefined;
          return {
            observationIntervalMs: Math.max(
              prev?.observationIntervalMs ?? DEFAULT_OBSERVATION_INTERVAL_MS,
              OBSERVATION_INTERVAL_LIMITS.min,
            ),
            arduinoCheckIntervalMs: prev?.arduinoCheckIntervalMs ?? DEFAULT_ARDUINO_CHECK_INTERVAL_MS,
          };
        }
        return persistedState;
      },
    },
  ),
);

function normalizeSettingMs(value: number, limits: { min: number; max: number; step: number }) {
  if (!Number.isFinite(value)) return limits.min;

  const steppedValue = Math.round(value / limits.step) * limits.step;
  return Math.min(Math.max(steppedValue, limits.min), limits.max);
}
