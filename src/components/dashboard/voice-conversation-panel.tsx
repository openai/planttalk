import { useEffect, useRef, useState } from "react";
import { PLANT_NAME, PLANT_VOICES } from "@/lib/plant/realtime-config";
import { selectIsConversationActive, useConversationStore } from "@/stores/plant/conversation-store";
import { useMicrophoneStore } from "@/stores/plant/microphone-store";
import { actionGlyph, type ActionStatus } from "@/components/dashboard/action-glyph";

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// The connection owns a detached audio element created inside the click gesture.
export function VoiceConversationPanel() {
  const status = useConversationStore((s) => s.status);
  const statusDetail = useConversationStore((s) => s.statusDetail);
  const isMuted = useConversationStore((s) => s.isMuted);
  const isUserSpeaking = useConversationStore((s) => s.isUserSpeaking);
  const isPlantSpeaking = useConversationStore((s) => s.isPlantSpeaking);
  const transcript = useConversationStore((s) => s.transcript);
  const toolActivity = useConversationStore((s) => s.toolActivity);
  const debugEvents = useConversationStore((s) => s.debugEvents);
  const errorMessage = useConversationStore((s) => s.errorMessage);
  const connect = useConversationStore((s) => s.connect);
  const disconnect = useConversationStore((s) => s.disconnect);
  const toggleMute = useConversationStore((s) => s.toggleMute);
  const clearTranscript = useConversationStore((s) => s.clearTranscript);
  const isActive = useConversationStore(selectIsConversationActive);

  const availableMicrophones = useMicrophoneStore((s) => s.availableMicrophones);
  const selectedMicrophoneId = useMicrophoneStore((s) => s.selectedMicrophoneId);
  const refreshMicrophoneList = useMicrophoneStore((s) => s.refreshMicrophoneList);
  const selectMicrophone = useMicrophoneStore((s) => s.selectMicrophone);
  const selectedVoice = useConversationStore((s) => s.selectedVoice);
  const setVoice = useConversationStore((s) => s.setVoice);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [transcript]);

  // Voice is billed per minute, so show how long the call has been connected.
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    if (status !== "connected") {
      setElapsedMs(0);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
  }, [status]);

  // Device labels fill in after microphone permission is granted.
  useEffect(() => {
    void refreshMicrophoneList();

    if (!("mediaDevices" in navigator) || !navigator.mediaDevices.addEventListener) return;
    const onDeviceChange = () => void refreshMicrophoneList();
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
  }, [refreshMicrophoneList]);

  // The selected mic may have been unplugged since last session.
  const selectionMissing =
    selectedMicrophoneId !== null &&
    availableMicrophones.length > 0 &&
    !availableMicrophones.some((mic) => mic.deviceId === selectedMicrophoneId);

  const actionStatus: ActionStatus =
    status === "connected"
      ? "done"
      : status === "requesting-mic" || status === "minting-token" || status === "connecting"
        ? "working"
        : status === "error"
          ? "error"
          : "todo";

  return (
    <article>
      <header>
        {actionGlyph(actionStatus)} <strong>Talk to {PLANT_NAME}</strong> <small>({status})</small>
      </header>

      {availableMicrophones.length > 0 && (
        <label>
          Microphone
          <select
            value={selectedMicrophoneId ?? ""}
            disabled={isActive}
            onChange={(event) => selectMicrophone(event.target.value || null)}
          >
            <option value="">Browser default</option>
            {availableMicrophones.map((mic) => (
              <option key={mic.deviceId} value={mic.deviceId}>
                {mic.label}
              </option>
            ))}
          </select>
          {isActive && <small>Hang up to switch microphones.</small>}
          {selectionMissing && <small>The previously selected microphone is not connected.</small>}
        </label>
      )}

      <label>
        Voice
        <select value={selectedVoice} disabled={isActive} onChange={(event) => setVoice(event.target.value)}>
          {PLANT_VOICES.map((voice) => (
            <option key={voice} value={voice}>
              {titleCase(voice)}
            </option>
          ))}
        </select>
        {isActive && <small>Hang up to change the voice.</small>}
      </label>

      {status === "connected" && (
        <div>
          <small>
            ⏱ {formatElapsed(elapsedMs)} · You {isUserSpeaking ? "🎙️ speaking" : "·"} — {PLANT_NAME}{" "}
            {isPlantSpeaking ? "🪴 speaking" : "·"}
          </small>
          <LevelMeters />
          <small>Auto-hangs up after a minute of silence to save on API costs.</small>
        </div>
      )}

      {transcript.length > 0 && (
        <div className="transcript">
          {transcript.map((entry) => (
            <p key={entry.id} className={entry.role === "user" ? "transcript-user" : "transcript-plant"}>
              <small>
                <strong>{entry.role === "user" ? "You" : PLANT_NAME}:</strong> {entry.text || "…"}
              </small>
            </p>
          ))}
          <div ref={transcriptEndRef} />
        </div>
      )}

      {toolActivity.length > 0 && (
        <details>
          <summary>
            <small>
              {PLANT_NAME} checked {toolActivity.length === 1 ? "a sense" : `senses ${toolActivity.length} times`} 🔧
            </small>
          </summary>
          <ul>
            {toolActivity.map((entry) => (
              <li key={entry.callId}>
                <small>
                  <code>{entry.name}</code> → <code>{entry.result ?? "running…"}</code>
                </small>
              </li>
            ))}
          </ul>
        </details>
      )}

      {debugEvents.length > 0 && (
        <details>
          <summary>
            <small>Raw server events (last {debugEvents.length})</small>
          </summary>
          <p>
            <small>
              <code>{debugEvents.map((e) => e.type).join(" · ")}</code>
            </small>
          </p>
        </details>
      )}

      {errorMessage && (
        <p>
          <mark>{errorMessage}</mark>
        </p>
      )}
      {statusDetail && (status === "error" || status === "disconnected") && (
        <p>
          <small>{statusDetail}</small>
        </p>
      )}

      <footer>
        <div role="group">
          <button
            type="button"
            aria-busy={isActive && status !== "connected"}
            onClick={isActive ? disconnect : () => void connect()}
          >
            {isActive ? "Hang up" : `Talk to ${PLANT_NAME}`}
          </button>
          {status === "connected" && (
            <button type="button" className="secondary" onClick={toggleMute}>
              {isMuted ? "Unmute mic" : "Mute mic"}
            </button>
          )}
          {transcript.length > 0 && !isActive && (
            <button type="button" className="secondary" onClick={clearTranscript}>
              Clear transcript
            </button>
          )}
        </div>
        <small>
          Customize {PLANT_NAME}'s personality in <code>src/lib/plant/realtime-config.ts</code> (the{" "}
          <code>PLANT_INSTRUCTIONS</code> string).
        </small>
      </footer>
    </article>
  );
}

// Draw audio levels outside React state; they change every animation frame.
function LevelMeters() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const getLocalAnalyser = useConversationStore((s) => s.getLocalAnalyser);
  const getRemoteAnalyser = useConversationStore((s) => s.getRemoteAnalyser);

  useEffect(() => {
    let frameId: number;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const buffer = new Uint8Array(128);

    const levelFrom = (analyser: AnalyserNode | null) => {
      if (!analyser) return 0;
      analyser.getByteFrequencyData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) sum += buffer[i];
      return sum / buffer.length / 255;
    };

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      context.clearRect(0, 0, width, height);

      const localLevel = levelFrom(getLocalAnalyser());
      const remoteLevel = levelFrom(getRemoteAnalyser());

      // You (top bar, green) and the plant (bottom bar, amber).
      context.fillStyle = "#4ade80";
      context.fillRect(0, 2, width * localLevel, height / 2 - 4);
      context.fillStyle = "#fbbf24";
      context.fillRect(0, height / 2 + 2, width * remoteLevel, height / 2 - 4);

      frameId = requestAnimationFrame(draw);
    };

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [getLocalAnalyser, getRemoteAnalyser]);

  return <canvas ref={canvasRef} width={300} height={28} className="level-meters" />;
}
