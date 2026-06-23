import { useObservationLoopStore } from "@/stores/plant/observation-loop-store";
import { usePlantCameraStore, type LiveCameraStatus } from "@/stores/plant/camera-store";
import { selectUsesFallback, usePlantSensorsStore } from "@/stores/plant/sensors-store";

// Status glyphs used across the debug rows:
//   ✅ healthy/ready   ⏳ waiting/working   🎚️ manual sliders
//   💤 idle/not started   ⚠️ unsupported   ❌ error/offline
function serialStatus(state: string): [string, string] {
  if (state === "connected") return ["✅", "connected"];
  if (state === "connecting") return ["⏳", "connecting…"];
  if (state === "unsupported") return ["⚠️", "Web Serial not supported"];
  return ["🎚️", "disconnected"];
}

function cameraStatusGlyph(status: LiveCameraStatus): [string, string] {
  switch (status) {
    case "ready":
      return ["✅", "ready"];
    case "starting":
      return ["⏳", "starting…"];
    case "error":
      return ["❌", "error"];
    case "unsupported":
      return ["⚠️", "not supported"];
    default:
      return ["💤", "idle"];
  }
}

export function DebugPanel() {
  const sensorMode = usePlantSensorsStore((s) => s.sensorMode);
  const connectionState = usePlantSensorsStore((s) => s.connectionState);
  const statusMessage = usePlantSensorsStore((s) => s.statusMessage);
  const lastHardwareReadingAt = usePlantSensorsStore((s) => s.lastHardwareReadingAt);
  const usesFallback = usePlantSensorsStore(selectUsesFallback);
  const cameraStatus = usePlantCameraStore((s) => s.cameraStatus);
  const modelLabel = useObservationLoopStore((s) => s.modelLabel);
  const lastUpdatedAt = useObservationLoopStore((s) => s.lastUpdatedAt);
  const isSubmitting = useObservationLoopStore((s) => s.isSubmitting);
  const observeError = useObservationLoopStore((s) => s.errorMessage);

  const [serialGlyph, serialLabel] = serialStatus(connectionState);
  const [camGlyph, camLabel] = cameraStatusGlyph(cameraStatus);
  const online = typeof navigator !== "undefined" && navigator.onLine;

  const [apiGlyph, apiLabel] = isSubmitting
    ? ["⏳", "observing…"]
    : observeError
      ? ["❌", observeError]
      : lastUpdatedAt
        ? ["✅", `${modelLabel} at ${lastUpdatedAt.toLocaleTimeString()}`]
        : ["💤", modelLabel];

  return (
    <article>
      <header>
        <strong>Debug</strong>
      </header>

      <table>
        <tbody>
          <tr>
            <td>Serial connection</td>
            <td>
              {serialGlyph} {serialLabel}
              {lastHardwareReadingAt && (
                <small> (last reading {new Date(lastHardwareReadingAt).toLocaleTimeString()})</small>
              )}
            </td>
          </tr>
          <tr>
            <td>Sensor source</td>
            <td>
              {usesFallback
                ? sensorMode === "arduino"
                  ? "⏳ Arduino selected, waiting for live readings"
                  : "🎚️ manual sliders"
                : "🔌 live Arduino"}
            </td>
          </tr>
          <tr>
            <td>Camera</td>
            <td>
              {camGlyph} {camLabel}
            </td>
          </tr>
          <tr>
            <td>Last API call</td>
            <td>
              {apiGlyph}{" "}
              <small>{apiLabel}</small>
            </td>
          </tr>
          <tr>
            <td>Network</td>
            <td>{online ? "✅ online" : "❌ offline"}</td>
          </tr>
          <tr>
            <td>Serial status</td>
            <td>
              <small>{statusMessage}</small>
            </td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}
