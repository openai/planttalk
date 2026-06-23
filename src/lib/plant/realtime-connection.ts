// Framework-free WebRTC connection for the Realtime voice conversation.

import { REALTIME_MODEL } from "@/lib/plant/realtime-config";

export type RealtimeConnectionStatus =
  | "idle"
  | "requesting-mic"
  | "minting-token"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface RealtimeConnectionCallbacks {
  onStatusChange: (status: RealtimeConnectionStatus, detail?: string) => void;
  /** The visitor's words, transcribed server-side from their mic audio. */
  onUserTranscript: (itemId: string, text: string, isFinal: boolean) => void;
  /** The plant's words — the transcript of the audio it is speaking. */
  onModelTranscript: (itemId: string, textDelta: string, isFinal: boolean) => void;
  /** Execute a tool call locally and return the result as a JSON string. */
  onToolCall: (call: { callId: string; name: string; args: string }) => Promise<string>;
  /** Fired after a tool result is sent back — for the dashboard activity log. */
  onToolResult: (callId: string, name: string, output: string) => void;
  onSpeechActivity: (kind: "user-start" | "user-stop" | "model-start" | "model-stop") => void;
  /** Every server event type, for the debug log. */
  onServerEvent?: (eventType: string) => void;
  onError: (message: string) => void;
}

export interface RealtimeConnectionOptions {
  /** Pin the conversation to a specific microphone (from enumerateDevices). */
  micDeviceId?: string | null;
  /** The plant's voice (validated server-side against the allowed list). */
  voice?: string | null;
}

// Auto-hang-up after this much silence (no one speaking) — Realtime audio is
// billed per minute, so a walked-away mic shouldn't keep the meter running.
// The timer resets whenever either party speaks, so this is a full minute of
// total quiet, not a cap on the conversation.
const IDLE_TIMEOUT_MS = 60_000;

export class RealtimeVoiceConnection {
  private callbacks: RealtimeConnectionCallbacks;
  private options: RealtimeConnectionOptions;
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private micStream: MediaStream | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private remoteAnalyser: AnalyserNode | null = null;
  // Checked after each await so a mid-handshake hang-up cannot leak a session.
  private cancelled = false;
  private responseCreateTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(callbacks: RealtimeConnectionCallbacks, options: RealtimeConnectionOptions = {}) {
    this.callbacks = callbacks;
    this.options = options;
  }

  // Read directly by the canvas level meters.
  getLocalAnalyser() {
    return this.localAnalyser;
  }
  getRemoteAnalyser() {
    return this.remoteAnalyser;
  }

  /** Mute toggles the mic track without tearing down the connection. */
  setMuted(muted: boolean) {
    this.micStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  async connect(): Promise<void> {
    try {
      // Echo cancellation keeps the model from hearing its own output.
      this.callbacks.onStatusChange("requesting-mic");
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(this.options.micDeviceId ? { deviceId: { exact: this.options.micDeviceId } } : {}),
      };
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      } catch (micError) {
        // The pinned mic may have been unplugged since it was selected — fall
        // back to the default device rather than failing the whole call.
        if (!this.options.micDeviceId) throw micError;
        console.warn("[realtime] Selected microphone unavailable, using default:", micError);
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      }
      if (this.cancelled) return this.releaseResources();

      // Mint a fresh, short-lived client secret for this connection attempt.
      this.callbacks.onStatusChange("minting-token");
      const tokenResponse = await fetch("/api/realtime-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: this.options.voice ?? undefined }),
      });
      if (!tokenResponse.ok) {
        const data = (await tokenResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to get a Realtime session token.");
      }
      const { clientSecret } = (await tokenResponse.json()) as { clientSecret: string };
      if (this.cancelled) return this.releaseResources();

      // WebRTC peer connection.
      this.callbacks.onStatusChange("connecting");
      const pc = new RTCPeerConnection();
      this.pc = pc;

      // Send the mic upstream.
      for (const track of this.micStream.getAudioTracks()) {
        pc.addTrack(track, this.micStream);
      }

      // Create playback inside the user's click gesture for browser autoplay.
      const audioElement = document.createElement("audio");
      audioElement.autoplay = true;
      this.audioElement = audioElement;

      // AnalyserNodes feed the level meters; playback stays on audioElement.
      const audioContext = new AudioContext();
      this.audioContext = audioContext;
      void audioContext.resume();

      this.localAnalyser = audioContext.createAnalyser();
      this.localAnalyser.fftSize = 256;
      audioContext.createMediaStreamSource(this.micStream).connect(this.localAnalyser);

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        audioElement.srcObject = remoteStream;
        void audioElement.play().catch((error) => {
          console.warn("[realtime] Audio playback failed:", error);
        });

        this.remoteAnalyser = audioContext.createAnalyser();
        this.remoteAnalyser.fftSize = 256;
        audioContext.createMediaStreamSource(remoteStream).connect(this.remoteAnalyser);
      };

      pc.onconnectionstatechange = () => {
        // Only "failed" is terminal — WebRTC's "disconnected" state is often a
        // transient network blip that recovers on its own within seconds.
        if (pc.connectionState === "failed") {
          this.callbacks.onError("Connection to the Realtime API was lost.");
          this.disconnect();
        }
      };

      // The data channel carries every JSON event in both directions.
      const dataChannel = pc.createDataChannel("oai-events");
      this.dataChannel = dataChannel;
      dataChannel.onmessage = (event) => {
        void this.handleServerEvent(JSON.parse(event.data as string));
      };
      dataChannel.onopen = () => {
        this.callbacks.onStatusChange("connected");
        this.resetIdleTimer();
      };

      // SDP handshake with OpenAI. After the answer is applied, audio flows.
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(`https://api.openai.com/v1/realtime/calls?model=${REALTIME_MODEL}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });
      if (this.cancelled) return this.releaseResources();

      if (!sdpResponse.ok) {
        throw new Error(`Realtime SDP exchange failed (HTTP ${sdpResponse.status}).`);
      }

      await pc.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
      if (this.cancelled) return this.releaseResources();
    } catch (error) {
      if (this.cancelled) return this.releaseResources();
      this.disconnect();
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone access was denied. Allow the mic to talk to the plant."
          : error instanceof Error
            ? error.message
            : "Failed to start the voice conversation.";
      this.callbacks.onStatusChange("error", message);
      this.callbacks.onError(message);
    }
  }

  /** Idempotent teardown. The optional reason is surfaced to the UI. */
  disconnect(reason?: string) {
    this.cancelled = true; // stops an in-flight connect() at its next await
    this.releaseResources();
    this.callbacks.onStatusChange("disconnected", reason);
  }

  // Restart the silence countdown — called on connect and on any speech.
  private resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.disconnect("Ended after a minute of silence to save on API costs. Tap to start again.");
    }, IDLE_TIMEOUT_MS);
  }

  private releaseResources() {
    if (this.responseCreateTimer) {
      clearTimeout(this.responseCreateTimer);
      this.responseCreateTimer = null;
    }
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    this.micStream?.getTracks().forEach((track) => track.stop());
    this.micStream = null;

    this.dataChannel?.close();
    this.dataChannel = null;

    this.pc?.close();
    this.pc = null;

    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.srcObject = null;
      this.audioElement = null;
    }

    void this.audioContext?.close().catch(() => {});
    this.audioContext = null;
    this.localAnalyser = null;
    this.remoteAnalyser = null;
  }

  /** Send a client event over the data channel (exposed for experiments). */
  sendEvent(event: object) {
    if (this.dataChannel?.readyState === "open") {
      this.dataChannel.send(JSON.stringify(event));
    }
  }

  // Handle the Realtime server events this app cares about.
  private async handleServerEvent(event: { type: string } & Record<string, unknown>) {
    this.callbacks.onServerEvent?.(event.type);

    switch (event.type) {
      // Any speech, either party, pushes back the idle timer.
      case "input_audio_buffer.speech_started":
        this.resetIdleTimer();
        this.callbacks.onSpeechActivity("user-start");
        break;
      case "input_audio_buffer.speech_stopped":
        this.resetIdleTimer();
        this.callbacks.onSpeechActivity("user-stop");
        break;
      case "output_audio_buffer.started": // WebRTC-only event
        this.resetIdleTimer();
        this.callbacks.onSpeechActivity("model-start");
        break;
      case "output_audio_buffer.stopped":
        this.resetIdleTimer();
        this.callbacks.onSpeechActivity("model-stop");
        break;

      // Input transcription runs asynchronously and often finishes AFTER
      // the plant has started replying. Registering the user's item as soon as it
      // is added to the conversation keeps the transcript in spoken order even
      // when the text itself arrives late.
      case "conversation.item.added":
      case "conversation.item.created": {
        const item = event.item as { id?: string; type?: string; role?: string } | undefined;
        if (item?.type === "message" && item.role === "user" && item.id) {
          this.callbacks.onUserTranscript(item.id, "", false);
        }
        break;
      }
      case "conversation.item.input_audio_transcription.delta":
        this.callbacks.onUserTranscript(String(event.item_id), String(event.delta ?? ""), false);
        break;
      case "conversation.item.input_audio_transcription.completed":
        this.callbacks.onUserTranscript(String(event.item_id), String(event.transcript ?? ""), true);
        break;

      case "response.output_audio_transcript.delta":
        this.callbacks.onModelTranscript(String(event.item_id), String(event.delta ?? ""), false);
        break;
      case "response.output_audio_transcript.done":
        // The done event carries the authoritative full transcript — pass it
        // through so any dropped deltas are corrected.
        this.callbacks.onModelTranscript(String(event.item_id), String(event.transcript ?? ""), true);
        break;

      // The model decided to use one of the plant's senses. The finished call
      // arrives as a completed output item; we execute it locally against the
      // browser stores, send the result back, then ask for a spoken response.
      case "response.output_item.done": {
        const item = event.item as { type?: string; call_id?: string; name?: string; arguments?: string } | undefined;
        if (item?.type === "function_call" && item.call_id && item.name) {
          await this.handleToolCall(item.call_id, item.name, item.arguments ?? "{}");
        }
        break;
      }

      case "error": {
        const err = event.error as { message?: string } | undefined;
        console.error("[realtime] Server error event:", event);
        this.callbacks.onError(err?.message ?? "The Realtime API reported an error.");
        break;
      }
    }
  }

  private async handleToolCall(callId: string, name: string, args: string) {
    let output: string;
    try {
      output = await this.callbacks.onToolCall({ callId, name, args });
    } catch (error) {
      // Send tool failures back as data instead of crashing the conversation.
      output = JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Tool execution failed.",
      });
    }

    // Return the result, then ask the model to respond with it.
    this.sendEvent({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: callId, output },
    });

    // Coalesce bursts of tool results into one response.create.
    if (this.responseCreateTimer) clearTimeout(this.responseCreateTimer);
    this.responseCreateTimer = setTimeout(() => {
      this.responseCreateTimer = null;
      this.sendEvent({ type: "response.create" });
    }, 150);

    this.callbacks.onToolResult(callId, name, output);
  }
}
