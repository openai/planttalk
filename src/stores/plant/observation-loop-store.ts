import { create } from "zustand";
import {
  selectObservationsForPrompt,
  summarizeObservationHistory,
  usePlantObserverStore,
} from "@/stores/plant/observer-store";
import {
  observePlantFileWithReasoningStream,
  type PlantObserverReasoningStreamEvent,
} from "@/lib/plant/plants";
import { selectSensorReadings, selectUsesFallback, usePlantSensorsStore } from "@/stores/plant/sensors-store";
import type { PlantSensorReadings, PlantSensorSource } from "@/lib/plant/sensors";
import type { PlantObserverThought, PlantTrendDirection } from "@/lib/plant/schemas";
import { usePlantCameraStore } from "@/stores/plant/camera-store";

// The periodic observation loop: every N minutes (see settings-store) a camera
// frame plus the current sensor readings are sent to the observe endpoint, the
// model's reasoning summaries stream into `reasoningLog` as they arrive, and
// the final structured observation is committed to the IndexedDB history.

/** Exponential backoff state for rate-limit (429) errors. */
let rateLimitBackoffUntil = 0;
let rateLimitConsecutiveFailures = 0;
const RATE_LIMIT_BASE_BACKOFF_MS = 60_000; // 1 minute minimum backoff
const RATE_LIMIT_MAX_BACKOFF_MS = 10 * 60_000; // 10 minute cap

export type LatestObservationSummary = {
  sensorReadings: PlantSensorReadings;
  sensorSource: PlantSensorSource;
  observerThoughts: PlantObserverThought[];
  observation: string;
  hypothesis: string;
  trend: PlantTrendDirection;
  dryness: number;
};

interface ObservationLoopState {
  latestObservation: LatestObservationSummary | null;
  reasoningLog: string[];
  modelLabel: string;
  errorMessage: string | null;
  isSubmitting: boolean;
  autoUpdatesEnabled: boolean;
  lastUpdatedAt: Date | null;

  setAutoUpdatesEnabled: (enabled: boolean) => void;
  toggleAutoUpdates: () => void;
  sendLiveUpdate: (source: "manual" | "auto", captureLiveFrame: () => Promise<File>) => Promise<void>;
}

export const useObservationLoopStore = create<ObservationLoopState>()((set, get) => ({
  latestObservation: null,
  reasoningLog: [],
  modelLabel: "Awaiting first observation",
  errorMessage: null,
  isSubmitting: false,
  autoUpdatesEnabled: false,
  lastUpdatedAt: null,

  setAutoUpdatesEnabled: (enabled) => set({ autoUpdatesEnabled: enabled }),
  toggleAutoUpdates: () => set((state) => ({ autoUpdatesEnabled: !state.autoUpdatesEnabled })),

  sendLiveUpdate: async (source, captureLiveFrame) => {
    const { isSubmitting } = get();
    const { cameraStatus } = usePlantCameraStore.getState();
    if (isSubmitting || cameraStatus !== "ready") return;

    // Don't burn API calls photographing a plant nobody is watching — auto
    // ticks pause while the tab is hidden (manual requests still go through).
    if (source === "auto" && typeof document !== "undefined" && document.hidden) {
      return;
    }

    // Rate-limit backoff: skip auto ticks during the cooldown window, but let
    // explicit manual requests through.
    if (Date.now() < rateLimitBackoffUntil && source === "auto") {
      console.info(
        `[observe] Skipping auto-update — rate-limit backoff active for ${Math.round((rateLimitBackoffUntil - Date.now()) / 1000)}s more`,
      );
      return;
    }

    set({ isSubmitting: true, errorMessage: null, reasoningLog: [] });

    try {
      const imageFile = await captureLiveFrame();

      const sensorsSnapshot = usePlantSensorsStore.getState();
      const sensorReadings = selectSensorReadings(sensorsSnapshot);
      // Whichever readings selectSensorReadings just returned, record where
      // they came from so the stored observation carries that provenance.
      const sensorSource: PlantSensorSource = selectUsesFallback(sensorsSnapshot) ? "fallback" : "hardware";
      const observerSnapshot = usePlantObserverStore.getState();
      const selectedObservations = selectObservationsForPrompt(observerSnapshot);
      const historySummary = summarizeObservationHistory(selectedObservations, observerSnapshot.observations);
      const hardwareSummary = buildHardwareStatusSummary(sensorsSnapshot);

      const streamedSummaryDedup = new Set<string>();

      const data = await observePlantFileWithReasoningStream({
        imageFile,
        sensorReadings,
        hardwareSummary,
        historySummary,
        onEvent: (event: PlantObserverReasoningStreamEvent) => {
          const summaryText = extractStreamReasoningSummaryText(event);
          if (!summaryText || !get().isSubmitting) return;

          const dedupKey = summaryText.trim().replace(/\s+/g, " ").toLowerCase();
          if (!dedupKey || streamedSummaryDedup.has(dedupKey)) return;

          streamedSummaryDedup.add(dedupKey);
          set((state) => ({ reasoningLog: [...state.reasoningLog, summaryText] }));
        },
      });

      if (!get().isSubmitting) return;

      // Success — reset rate-limit backoff state
      rateLimitConsecutiveFailures = 0;
      rateLimitBackoffUntil = 0;

      set({
        latestObservation: {
          sensorReadings: data.sensorReadings,
          sensorSource,
          observerThoughts: data.observerThoughts,
          observation: data.observation,
          hypothesis: data.hypothesis,
          trend: data.trend,
          dryness: data.dryness,
        },
        modelLabel: data.model,
        lastUpdatedAt: new Date(),
        isSubmitting: false,
      });

      usePlantObserverStore.getState().addObservation({
        id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `obs-${Date.now()}`,
        recordedAt: Date.now(),
        sensorReadings: data.sensorReadings,
        sensorSource,
        observerThoughts: data.observerThoughts,
        observation: data.observation,
        hypothesis: data.hypothesis,
        trend: data.trend,
        dryness: data.dryness,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : source === "auto"
            ? "Automatic plant update failed."
            : "Plant update failed.";

      // Detect rate-limit errors and apply exponential backoff so the loop
      // doesn't hammer the API when it's already saying "slow down".
      const isRateLimited =
        message.includes("rate_limit") ||
        message.includes("Rate limit") ||
        message.includes("slow_down") ||
        message.includes("429") ||
        (error && typeof error === "object" && "retryable" in error && Boolean((error as { retryable?: boolean }).retryable));

      if (isRateLimited) {
        rateLimitConsecutiveFailures += 1;
        const backoffMs = Math.min(
          RATE_LIMIT_BASE_BACKOFF_MS * Math.pow(2, rateLimitConsecutiveFailures - 1),
          RATE_LIMIT_MAX_BACKOFF_MS,
        );
        rateLimitBackoffUntil = Date.now() + backoffMs;
        console.warn(
          `[observe] Rate limited (attempt #${rateLimitConsecutiveFailures}). Backing off for ${Math.round(backoffMs / 1000)}s.`,
        );
      }

      if (source === "auto") {
        // Auto updates recover silently — the next interval retries.
        console.warn("[observe] Auto-update failed, will retry on next interval:", message);
        set({ isSubmitting: false });
      } else {
        set({ errorMessage: message, isSubmitting: false });
      }
    }
  },
}));

// One compact line describing how much to trust the sensor data, passed into
// the observer prompt (see PLANT_OBSERVER_PROMPTS).
function buildHardwareStatusSummary(sensors: ReturnType<typeof usePlantSensorsStore.getState>): string {
  const { connectionState, lastHardwareReadingAt } = sensors;
  if (connectionState === "connected") {
    // Connected but no data yet (the Arduino takes a few seconds to boot) —
    // the readings in the prompt are still the fallback estimates.
    if (lastHardwareReadingAt === null) {
      return "arduino=connected; sensor_data=fallback_sliders (awaiting first hardware reading)";
    }
    return "arduino=connected; sensor_data=live";
  }
  if (lastHardwareReadingAt !== null) {
    const staleMin = Math.round((Date.now() - lastHardwareReadingAt) / 60000);
    return `arduino=disconnected; last_reading=${staleMin}m ago; sensor_data=stale`;
  }
  return "arduino=not_connected; sensor_data=fallback_sliders";
}

function extractStreamReasoningSummaryText(event: PlantObserverReasoningStreamEvent): string | null {
  if (event.type === "reasoning_summary_part_done" || event.type === "reasoning_summary_done") {
    const text = event.text.trim();
    return text ? text : null;
  }

  return null;
}
