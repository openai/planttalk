import {
  selectIsConnecting,
  selectIsHardwareConnected,
  selectIsSerialSupported,
  selectSensorReadings,
  selectUsesFallback,
  usePlantSensorsStore,
} from "@/stores/plant/sensors-store";
import { describeLightReading } from "@/lib/plant/sensors";
import { formatSensorValue, plantSensorFields } from "@/lib/plant/plants";
import { actionGlyph, type ActionStatus } from "@/components/dashboard/action-glyph";
import { ARDUINO_CHECK_INTERVAL_LIMITS, usePlantSettingsStore } from "@/stores/plant/settings-store";

export function SensorsPanel() {
  const isConnecting = usePlantSensorsStore(selectIsConnecting);
  const isHardwareConnected = usePlantSensorsStore(selectIsHardwareConnected);
  const isSerialSupported = usePlantSensorsStore(selectIsSerialSupported);
  const sensorReadings = usePlantSensorsStore(selectSensorReadings);
  const statusMessage = usePlantSensorsStore((s) => s.statusMessage);
  const usesFallback = usePlantSensorsStore(selectUsesFallback);
  const connect = usePlantSensorsStore((s) => s.connect);
  const disconnect = usePlantSensorsStore((s) => s.disconnect);
  const setFallbackSensorValue = usePlantSensorsStore((s) => s.setFallbackSensorValue);
  const sendCommand = usePlantSensorsStore((s) => s.sendCommand);

  const arduinoCheckIntervalMs = usePlantSettingsStore((s) => s.arduinoCheckIntervalMs);
  const setArduinoCheckIntervalMs = usePlantSettingsStore((s) => s.setArduinoCheckIntervalMs);

  // The Arduino only learns its reporting rate over serial, so changing the
  // setting while connected must also send the command (it is otherwise only
  // sent once at connect time).
  const applyArduinoInterval = (value: number) => {
    setArduinoCheckIntervalMs(value);
    if (isHardwareConnected) {
      void sendCommand(`interval ${usePlantSettingsStore.getState().arduinoCheckIntervalMs}`);
    }
  };

  // Connecting the Arduino is optional (the sliders work), so "not connected"
  // shows 👉 as a suggestion rather than ❌.
  const status: ActionStatus = isHardwareConnected ? "done" : isConnecting ? "working" : "todo";

  return (
    <article>
      <header>
        {actionGlyph(status)} <strong>Sensors</strong>{" "}
        <small>
          (
          {isHardwareConnected
            ? "live Arduino feed"
            : usesFallback
              ? "fallback sliders"
              : "waiting for data"}
          )
        </small>
      </header>

      <p>
        Soil moisture: <strong>{Math.round(sensorReadings.moisture)}%</strong>
        <progress value={sensorReadings.moisture} max={100} />
        Light: <strong>{describeLightReading(sensorReadings.light)}</strong>
      </p>

      <p>
        <small>{statusMessage}</small>
      </p>

      {usesFallback ? (
        // No live hardware: the sliders are the active controls, so show them directly.
        <>
          {plantSensorFields.map((field) => (
            <label key={field.key}>
              {field.label}: {formatSensorValue(sensorReadings[field.key], field.unit, field.step)}
              <input
                type="range"
                min={field.min}
                max={field.max}
                step={field.step}
                value={sensorReadings[field.key]}
                onChange={(event) => setFallbackSensorValue(field.key, Number(event.target.value))}
              />
              <small>{field.helper}</small>
            </label>
          ))}
        </>
      ) : (
        // Live Arduino feed: the only relevant control is how often it reports.
        <label>
          Report interval: {arduinoCheckIntervalMs} ms
          <input
            type="range"
            min={ARDUINO_CHECK_INTERVAL_LIMITS.min}
            max={ARDUINO_CHECK_INTERVAL_LIMITS.max}
            step={ARDUINO_CHECK_INTERVAL_LIMITS.step}
            value={arduinoCheckIntervalMs}
            onChange={(event) => applyArduinoInterval(Number(event.target.value))}
          />
          <small>How often the Arduino emits a sensor line over serial.</small>
        </label>
      )}

      <footer>
        <button
          type="button"
          className="secondary"
          disabled={!isSerialSupported || isConnecting}
          aria-busy={isConnecting}
          onClick={isHardwareConnected ? disconnect : connect}
        >
          {isHardwareConnected ? "Disconnect Arduino" : "Connect Arduino"}
        </button>
      </footer>
    </article>
  );
}
