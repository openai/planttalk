import { useEffect, useState } from "react";
import { useObservationLoopStore } from "@/stores/plant/observation-loop-store";
import { captureLiveFrame, usePlantCameraStore } from "@/stores/plant/camera-store";
import { OBSERVATION_INTERVAL_LIMITS, usePlantSettingsStore } from "@/stores/plant/settings-store";
import { actionGlyph, type ActionStatus } from "@/components/dashboard/action-glyph";

/** Formats remaining milliseconds as "Xm Ys". */
function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

// Shows the most recent observation plus the model's reasoning summaries as
// they stream in live during a cycle.
export function ObservationPanel() {
  const latestObservation = useObservationLoopStore((s) => s.latestObservation);
  const reasoningLog = useObservationLoopStore((s) => s.reasoningLog);
  const isSubmitting = useObservationLoopStore((s) => s.isSubmitting);
  const autoUpdatesEnabled = useObservationLoopStore((s) => s.autoUpdatesEnabled);
  const toggleAutoUpdates = useObservationLoopStore((s) => s.toggleAutoUpdates);
  const sendLiveUpdate = useObservationLoopStore((s) => s.sendLiveUpdate);
  const errorMessage = useObservationLoopStore((s) => s.errorMessage);
  const lastUpdatedAt = useObservationLoopStore((s) => s.lastUpdatedAt);
  const cameraStatus = usePlantCameraStore((s) => s.cameraStatus);
  const observationIntervalMs = usePlantSettingsStore((s) => s.observationIntervalMs);
  const setObservationIntervalMs = usePlantSettingsStore((s) => s.setObservationIntervalMs);

  // Countdown to next auto-observation
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    if (!autoUpdatesEnabled || !lastUpdatedAt) {
      setCountdown(null);
      return;
    }

    const tick = () => {
      const elapsed = Date.now() - lastUpdatedAt.getTime();
      const remaining = observationIntervalMs - elapsed;
      setCountdown(remaining > 0 ? formatCountdown(remaining) : "any moment…");
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [autoUpdatesEnabled, lastUpdatedAt, observationIntervalMs]);

  const status: ActionStatus = isSubmitting ? "working" : autoUpdatesEnabled ? "done" : "todo";

  return (
    <article>
      <header>
        {actionGlyph(status)} <strong>Observation loop</strong>{" "}
        <small>
          {lastUpdatedAt ? `(last: ${lastUpdatedAt.toLocaleTimeString()})` : "(no observations yet)"}
          {countdown && ` · next in ${countdown}`}
        </small>
      </header>

      {latestObservation && (
        <>
          <p>{latestObservation.observation}</p>
          <p>
            <small>
              <em>Hypothesis: {latestObservation.hypothesis}</em>
            </small>
          </p>
          <p>
            <kbd>trend: {latestObservation.trend}</kbd> <kbd>dryness: {latestObservation.dryness}/10</kbd>
          </p>
        </>
      )}

      {(isSubmitting || reasoningLog.length > 0) && (
        <details open={isSubmitting}>
          <summary>Model reasoning summaries {isSubmitting ? "(streaming…)" : ""}</summary>
          <ul>
            {reasoningLog.map((entry, index) => (
              <li key={index}>
                <small>{entry}</small>
              </li>
            ))}
            {isSubmitting && reasoningLog.length === 0 && (
              <li>
                <small>Waiting for the model…</small>
              </li>
            )}
          </ul>
        </details>
      )}

      {errorMessage && (
        <p>
          <mark>{errorMessage}</mark>
        </p>
      )}

      <footer>
        <button
          type="button"
          disabled={isSubmitting || cameraStatus !== "ready"}
          aria-busy={isSubmitting}
          onClick={() => void sendLiveUpdate("manual", captureLiveFrame)}
        >
          Observe now
        </button>
        <label>
          <input type="checkbox" role="switch" checked={autoUpdatesEnabled} onChange={toggleAutoUpdates} />
          Observe automatically
        </label>
        <label>
          Interval: {Math.round(observationIntervalMs / 60_000)} min
          <input
            type="range"
            min={OBSERVATION_INTERVAL_LIMITS.min}
            max={OBSERVATION_INTERVAL_LIMITS.max}
            step={OBSERVATION_INTERVAL_LIMITS.step}
            value={observationIntervalMs}
            onChange={(event) => setObservationIntervalMs(Number(event.target.value))}
          />
          <small>How often the loop photographs the plant and calls the model (5–30 min).</small>
        </label>
        {cameraStatus !== "ready" && <small>Start the camera to begin observing.</small>}
      </footer>
    </article>
  );
}
