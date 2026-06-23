import { usePlantObserverStore } from "@/stores/plant/observer-store";
import { describeLightReading } from "@/lib/plant/sensors";

const VISIBLE_HISTORY_COUNT = 25;

// The plant's memory: observation records persisted to IndexedDB. Survives
// reloads — this is what the plant draws on when it talks about its past.
export function HistoryPanel() {
  const observations = usePlantObserverStore((s) => s.observations);
  const clearObservations = usePlantObserverStore((s) => s.clearObservations);

  const recentFirst = observations.slice(-VISIBLE_HISTORY_COUNT).reverse();

  return (
    <article>
      <header>
        <strong>Observation history</strong>{" "}
        <small>({observations.length} stored in IndexedDB)</small>
      </header>

      {recentFirst.length === 0 ? (
        <p>
          <small>No observations recorded yet. Run the observation loop to build the plant's memory.</small>
        </p>
      ) : (
        <ul className="history-list">
          {recentFirst.map((record) => (
            <li key={record.id}>
              <small>
                <strong>{new Date(record.recordedAt).toLocaleString()}</strong>{" "}
                {/* Flag slider-based readings so the list doesn't imply they were measured. */}
                <span title={record.sensorSource === "fallback" ? "readings from manual sliders" : "readings from the Arduino"}>
                  {record.sensorSource === "fallback" ? "🎚️" : "🔌"}
                </span>{" "}
                — {record.observation}{" "}
                <em>
                  (moisture {Math.round(record.sensorReadings.moisture)}%, light{" "}
                  {describeLightReading(record.sensorReadings.light)}, dryness {record.dryness}/10,{" "}
                  {record.trend})
                </em>
              </small>
            </li>
          ))}
        </ul>
      )}

      {observations.length > 0 && (
        <footer>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (window.confirm("Erase the plant's entire observation history?")) {
                clearObservations();
              }
            }}
          >
            Clear history
          </button>
        </footer>
      )}
    </article>
  );
}
