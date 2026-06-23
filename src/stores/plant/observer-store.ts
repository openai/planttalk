import { del, get, set } from "idb-keyval";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";
import type { PlantSensorReadings, PlantSensorSource } from "@/lib/plant/sensors";
import { describeLightReading } from "@/lib/plant/sensors";
import type { PlantObserverThought, PlantTrendDirection } from "@/lib/plant/schemas";

// Observation memory persisted to IndexedDB.

const PLANT_OBSERVER_STORE_KEY = "plant-observer-store/v1";
const MAX_OBSERVATIONS = 1440; // ring buffer cap (~10 days at the default 10-minute cycle)
const HISTORY_RECENT_COUNT = 5; // most recent records, anchored to "right now"
const HISTORY_SPARSE_COUNT = 6; // evenly-spaced anchors across the full stored window

export interface PlantObservationRecord {
  id: string;
  recordedAt: number;
  sensorReadings: PlantSensorReadings;
  /** Whether sensorReadings came from live hardware or the manual sliders. */
  sensorSource: PlantSensorSource;
  observerThoughts: PlantObserverThought[];
  observation: string;
  hypothesis: string;
  trend: PlantTrendDirection;
  dryness: number;
}

interface PlantObserverState {
  observations: PlantObservationRecord[];
  addObservation: (record: PlantObservationRecord) => void;
  clearObservations: () => void;
}

const idbStorage: StateStorage = {
  getItem: async (name) => {
    const value = await get<string>(name);
    return value ?? null;
  },
  setItem: async (name, value) => {
    await set(name, value);
  },
  removeItem: async (name) => {
    await del(name);
  },
};

// Shape of records persisted by older versions of this store (which also
// tracked a water pump and extra sensors). The migrate step below maps them
// into the current shape so accumulated memory survives the upgrade.
interface LegacyObservationRecord {
  id?: string;
  recordedAt?: number;
  sensorReadings?: { moisture?: number; light?: number; ambientLight?: number };
  observerThoughts?: string[];
  analysis?: { dryness?: number };
  dryness?: number;
  observation?: string;
  hypothesis?: string;
  trend?: PlantTrendDirection;
}

export const usePlantObserverStore = create<PlantObserverState>()(
  persist(
    (setState) => ({
      observations: [],

      addObservation: (record) =>
        setState((state) => ({
          observations: [...state.observations, record].slice(-MAX_OBSERVATIONS),
        })),

      clearObservations: () => setState({ observations: [] }),
    }),
    {
      name: PLANT_OBSERVER_STORE_KEY,
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({
        observations: state.observations,
      }),
      version: 4,
      migrate: (persistedState: unknown, version: number) => {
        let state = persistedState as { observations?: Array<Record<string, unknown>> } | undefined;

        if (version < 3) {
          const legacy = persistedState as { observations?: LegacyObservationRecord[] } | undefined;
          state = {
            observations: (legacy?.observations ?? [])
              .filter((r) => r.id && r.recordedAt)
              .map((r) => ({
                id: r.id!,
                recordedAt: r.recordedAt!,
                sensorReadings: {
                  moisture: r.sensorReadings?.moisture ?? 50,
                  light: r.sensorReadings?.light ?? r.sensorReadings?.ambientLight ?? 0,
                },
                observerThoughts: r.observerThoughts ?? [],
                observation: r.observation ?? "",
                hypothesis: r.hypothesis ?? "",
                trend: r.trend ?? "insufficient-data",
                dryness: r.dryness ?? r.analysis?.dryness ?? 5,
              })),
          };
        }

        if (version < 4) {
          // sensorSource was added in v4. Older records predate the
          // distinction, so mark them "fallback" — the conservative choice
          // that tells the model to trust the photo over those numbers.
          state = {
            observations: (state?.observations ?? []).map((r) => ({
              ...r,
              sensorSource: r.sensorSource ?? "fallback",
            })),
          };
        }

        return state;
      },
    },
  ),
);

// Keep prompts bounded with sparse older records plus dense recent records.
export function selectObservationsForPrompt(state: {
  observations: PlantObservationRecord[];
}): PlantObservationRecord[] {
  const all = state.observations;
  if (all.length === 0) return [];

  const recent = all.slice(-HISTORY_RECENT_COUNT);
  const older = all.slice(0, -HISTORY_RECENT_COUNT);

  const sparse: PlantObservationRecord[] = [];
  if (older.length > 0) {
    for (let i = 0; i < HISTORY_SPARSE_COUNT; i++) {
      const idx = Math.round((i / (HISTORY_SPARSE_COUNT - 1 || 1)) * (older.length - 1));
      sparse.push(older[idx]);
    }
  }

  // Merge, deduplicate by id, restore chronological order.
  const seen = new Set<string>();
  return [...sparse, ...recent].filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

// Compact trend summary over the full stored window.
export function computeHistorySummary(all: PlantObservationRecord[]): string {
  if (all.length < 2) return "";

  const oldest = all[0];
  const newest = all[all.length - 1];
  const spanMin = Math.round((newest.recordedAt - oldest.recordedAt) / 60000);
  const spanHours = (spanMin / 60).toFixed(1);

  const moistures = all.map((r) => r.sensorReadings.moisture);
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const avgMoisture = Math.round(avg(moistures));
  const minMoisture = Math.round(Math.min(...moistures));
  const maxMoisture = Math.round(Math.max(...moistures));
  const third = Math.max(1, Math.floor(all.length / 3));
  const moistureTrend =
    avg(moistures.slice(-third)) - avg(moistures.slice(0, third)) > 3
      ? "rising"
      : avg(moistures.slice(-third)) - avg(moistures.slice(0, third)) < -3
        ? "declining"
        : "stable";

  const minPerRecord = all.length > 1 ? spanMin / (all.length - 1) : 10;
  const lightOnHours = ((all.filter((r) => r.sensorReadings.light > 50).length * minPerRecord) / 60).toFixed(1);

  return [
    `[history summary over ${spanHours}hr / ${all.length} observations]`,
    `moisture avg=${avgMoisture}% range=${minMoisture}-${maxMoisture}% ${moistureTrend}`,
    `light on ~${lightOnHours}hr of window`,
  ].join(" | ");
}

// selectedRecords is the sparse+recent subset to show as individual rows.
// allRecords is the full stored window used only for the aggregate summary.
export function summarizeObservationHistory(
  selectedRecords: PlantObservationRecord[],
  allRecords: PlantObservationRecord[] = selectedRecords,
): string {
  if (allRecords.length === 0) return "No prior observations recorded yet.";

  const summary = computeHistorySummary(allRecords);
  const rows = selectedRecords
    .map((record, index) => {
      const ageMinutes = Math.max(0, Math.round((Date.now() - record.recordedAt) / 60000));
      const sensors = record.sensorReadings;
      // Mark slider-based rows so the model discounts their numbers and leans
      // on the observation text (which was grounded in the photo) instead.
      const estimate = record.sensorSource === "fallback" ? " (manual estimate)" : "";
      return [
        `#${index + 1} (${ageMinutes}m ago)`,
        `trend=${record.trend}`,
        `dryness=${record.dryness}/10`,
        `moisture=${Math.round(sensors.moisture)}%${estimate}`,
        `light=${describeLightReading(sensors.light)}${estimate}`,
        `note="${record.observation.replace(/"/g, "'").slice(0, 160)}"`,
        `thought="${record.hypothesis.replace(/"/g, "'").slice(0, 120)}"`,
      ].join(" | ");
    })
    .join("\n");

  return summary ? `${summary}\n${rows}` : rows;
}
