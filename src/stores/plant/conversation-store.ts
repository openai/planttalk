import { create } from "zustand";
import {
  RealtimeVoiceConnection,
  type RealtimeConnectionStatus,
} from "@/lib/plant/realtime-connection";
import { executePlantTool } from "@/lib/plant/realtime-tools";
import { useMicrophoneStore } from "@/stores/plant/microphone-store";
import { PLANT_VOICE } from "@/lib/plant/realtime-config";

const SELECTED_VOICE_STORAGE_KEY = "plant-voice/selected";

// Thin reactive wrapper around RealtimeVoiceConnection. The connection object
// itself is held in a closure (it is not renderable state); only things the
// dashboard draws — status, transcript, tool activity — go through set().

export interface TranscriptEntry {
  id: string;
  role: "user" | "plant";
  text: string;
  isFinal: boolean;
  at: number;
}

export interface ToolActivityEntry {
  callId: string;
  name: string;
  args: string;
  result: string | null;
  at: number;
}

const MAX_TRANSCRIPT_ENTRIES = 200;
const MAX_TOOL_ACTIVITY_ENTRIES = 50;
const MAX_DEBUG_EVENTS = 100;

interface ConversationState {
  status: RealtimeConnectionStatus;
  statusDetail: string | null;
  isMuted: boolean;
  isUserSpeaking: boolean;
  isPlantSpeaking: boolean;
  transcript: TranscriptEntry[];
  toolActivity: ToolActivityEntry[];
  debugEvents: Array<{ type: string; at: number }>;
  errorMessage: string | null;
  selectedVoice: string;

  connect: () => Promise<void>;
  disconnect: () => void;
  toggleMute: () => void;
  clearTranscript: () => void;
  setVoice: (voice: string) => void;

  // Non-reactive accessors for the rAF level meters — see the panel.
  getLocalAnalyser: () => AnalyserNode | null;
  getRemoteAnalyser: () => AnalyserNode | null;
}

export const useConversationStore = create<ConversationState>()((set, get) => {
  let connection: RealtimeVoiceConnection | null = null;

  // Transcript entries stream in as deltas keyed by the conversation item id;
  // upsert so each utterance grows in place instead of duplicating. Final
  // events carry the authoritative full text (for both sides), so a non-empty
  // final REPLACES the accumulated deltas instead of appending.
  function upsertTranscript(id: string, role: "user" | "plant", text: string, isFinal: boolean) {
    set((state) => {
      const existing = state.transcript.find((entry) => entry.id === id);
      const nextEntries = existing
        ? state.transcript.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  text: isFinal && text ? text : entry.text + text,
                  isFinal,
                }
              : entry,
          )
        : [...state.transcript, { id, role, text, isFinal, at: Date.now() }];
      return { transcript: nextEntries.slice(-MAX_TRANSCRIPT_ENTRIES) };
    });
  }

  return {
    status: "idle",
    statusDetail: null,
    isMuted: false,
    isUserSpeaking: false,
    isPlantSpeaking: false,
    transcript: [],
    toolActivity: [],
    debugEvents: [],
    errorMessage: null,
    selectedVoice:
      (typeof localStorage !== "undefined" && localStorage.getItem(SELECTED_VOICE_STORAGE_KEY)) || PLANT_VOICE,

    connect: async () => {
      if (connection) return; // already connected or connecting

      set({ errorMessage: null, statusDetail: null, isMuted: false });

      connection = new RealtimeVoiceConnection(
        {
          onStatusChange: (status, detail) => {
            set({ status, statusDetail: detail ?? null });
            if (status === "connected") {
              // Mic permission was just granted — device labels are now
              // available for the microphone dropdown.
              void useMicrophoneStore.getState().refreshMicrophoneList();
            }
            if (status === "disconnected" || status === "error") {
              connection = null;
              set({ isUserSpeaking: false, isPlantSpeaking: false });
            }
          },

          onUserTranscript: (itemId, text, isFinal) => upsertTranscript(itemId, "user", text, isFinal),
          onModelTranscript: (itemId, delta, isFinal) => upsertTranscript(itemId, "plant", delta, isFinal),

          onToolCall: async ({ callId, name, args }) => {
            set((state) => ({
              toolActivity: [
                ...state.toolActivity,
                { callId, name, args, result: null, at: Date.now() },
              ].slice(-MAX_TOOL_ACTIVITY_ENTRIES),
            }));
            return executePlantTool(name, args);
          },

          onToolResult: (callId, _name, output) => {
            set((state) => ({
              toolActivity: state.toolActivity.map((entry) =>
                entry.callId === callId ? { ...entry, result: output } : entry,
              ),
            }));
          },

          onSpeechActivity: (kind) => {
            if (kind === "user-start") set({ isUserSpeaking: true });
            if (kind === "user-stop") set({ isUserSpeaking: false });
            if (kind === "model-start") set({ isPlantSpeaking: true });
            if (kind === "model-stop") set({ isPlantSpeaking: false });
          },

          onServerEvent: (eventType) => {
            set((state) => ({
              debugEvents: [...state.debugEvents, { type: eventType, at: Date.now() }].slice(-MAX_DEBUG_EVENTS),
            }));
          },

          onError: (message) => set({ errorMessage: message }),
        },
        // Mic and voice are read at call time — change either, then start a call.
        { micDeviceId: useMicrophoneStore.getState().selectedMicrophoneId, voice: get().selectedVoice },
      );

      await connection.connect();
    },

    disconnect: () => {
      connection?.disconnect();
      connection = null;
    },

    toggleMute: () => {
      const nextMuted = !get().isMuted;
      connection?.setMuted(nextMuted);
      set({ isMuted: nextMuted });
    },

    clearTranscript: () => set({ transcript: [], toolActivity: [] }),

    setVoice: (voice) => {
      set({ selectedVoice: voice });
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(SELECTED_VOICE_STORAGE_KEY, voice);
      }
    },

    getLocalAnalyser: () => connection?.getLocalAnalyser() ?? null,
    getRemoteAnalyser: () => connection?.getRemoteAnalyser() ?? null,
  };
});

export function selectIsConversationActive(state: ConversationState) {
  return state.status === "connected" || state.status === "connecting" || state.status === "minting-token" || state.status === "requesting-mic";
}
