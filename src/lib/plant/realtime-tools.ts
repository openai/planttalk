// The plant's senses: the client-side implementations of the tools declared
// in realtime-config.ts. When the model calls a tool mid-conversation, the
// browser executes it here — against the same Zustand stores the dashboard
// renders — and the result travels back over the WebRTC data channel.
//
// Tool outputs must be strings; JSON is the convention so the model can read
// structure out of them.

import { describeLightReading } from "@/lib/plant/sensors";
import {
  selectHasFreshHardwareReadings,
  selectSensorReadings,
  usePlantSensorsStore,
} from "@/stores/plant/sensors-store";
import {
  computeHistorySummary,
  selectObservationsForPrompt,
  summarizeObservationHistory,
  usePlantObserverStore,
} from "@/stores/plant/observer-store";

export async function executePlantTool(name: string, argsJson: string): Promise<string> {
  switch (name) {
    case "get_current_sensors": {
      const sensorsState = usePlantSensorsStore.getState();
      const readings = selectSensorReadings(sensorsState);
      return JSON.stringify({
        soilMoisturePercent: Math.round(readings.moisture),
        light: describeLightReading(readings.light),
        source: selectHasFreshHardwareReadings(sensorsState)
          ? "live Arduino sensors"
          : "manual fallback sliders (no live hardware connected)",
      });
    }

    case "get_observation_history": {
      const state = usePlantObserverStore.getState();
      if (state.observations.length === 0) {
        return JSON.stringify({ summary: "No prior observations recorded yet." });
      }

      const args = parseArgs(argsJson);
      if (args.window === "full") {
        return JSON.stringify({
          summary: computeHistorySummary(state.observations) || "Only one observation recorded so far.",
        });
      }

      const selected = selectObservationsForPrompt(state);
      return JSON.stringify({
        summary: summarizeObservationHistory(selected, state.observations),
      });
    }

    default:
      return JSON.stringify({ ok: false, error: `Unknown tool: ${name}` });
  }
}

function parseArgs(argsJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argsJson) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
