import { useEffect, useRef } from "react";
import { PLANT_NAME } from "@/lib/plant/realtime-config";
import { describeLightReading } from "@/lib/plant/sensors";
import { selectSensorReadings, usePlantSensorsStore } from "@/stores/plant/sensors-store";
import { selectIsConversationActive, useConversationStore } from "@/stores/plant/conversation-store";
import { NumberCounter } from "@/components/public/number-counter";
import { StreamingText } from "@/components/public/streaming-text";

interface IntroViewProps {
  onBack: () => void;
}

function getIdleLine(moisture: number, light: number): string {
  if (moisture < 25) return "I'm a little thirsty - but hi, let's chat!";
  if (moisture < 45) return "Oh, hello! What should we talk about?";
  if (light <= 50) return "Mmm, dim and cozy. Talk to me.";
  return "Feeling lush today - say hi!";
}

export function IntroView({ onBack }: IntroViewProps) {
  const readings = usePlantSensorsStore(selectSensorReadings);
  const status = useConversationStore((state) => state.status);
  const errorMessage = useConversationStore((state) => state.errorMessage);
  const connect = useConversationStore((state) => state.connect);
  const disconnect = useConversationStore((state) => state.disconnect);
  const isActive = useConversationStore(selectIsConversationActive);

  const lastPlantLine = useConversationStore((state) => {
    for (let i = state.transcript.length - 1; i >= 0; i--) {
      if (state.transcript[i].role === "plant" && state.transcript[i].text.trim()) {
        return state.transcript[i].text;
      }
    }
    return null;
  });

  // Entering this screen starts the same Realtime call the dashboard uses.
  useEffect(() => {
    void connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // When the live call ends, return to the landing screen for the next visitor.
  // Wait until a real connection happened so StrictMode's mount check cannot
  // bounce the view back immediately.
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const wasConnectedRef = useRef(false);
  useEffect(() => {
    if (status === "connected") {
      wasConnectedRef.current = true;
    } else if (wasConnectedRef.current && !isActive) {
      wasConnectedRef.current = false;
      onBackRef.current();
    }
  }, [status, isActive]);

  const isConnected = status === "connected";
  // The light sensor is binary; the client shows it as Room Brightness High/Low.
  const brightnessLabel = describeLightReading(readings.light) === "on" ? "High" : "Low";

  const speaking = isConnected && !!lastPlantLine;
  const idleLine =
    errorMessage ?? (isConnected ? getIdleLine(readings.moisture, readings.light) : "Connecting voice chat...");

  return (
    <div className="public-experience__intro">
      <button type="button" className="public-experience__brand" onClick={onBack}>
        {PLANT_NAME}
      </button>

      <div className="public-experience__phrase-wrap">
        {speaking ? (
          <p className="public-experience__phrase">
            <StreamingText text={lastPlantLine} />
          </p>
        ) : (
          <p className="public-experience__phrase public-experience__phrase--muted">{idleLine}</p>
        )}
      </div>

      <div className="public-experience__stats">
        <div className="public-experience__stat">
          <span className="public-experience__stat-label">Soil Moisture</span>
          <NumberCounter className="public-experience__stat-value" value={readings.moisture} suffix="%" />
        </div>
        <div className="public-experience__stat">
          <span className="public-experience__stat-label">Room Brightness</span>
          <span className="public-experience__stat-value">{brightnessLabel}</span>
        </div>
      </div>
    </div>
  );
}
