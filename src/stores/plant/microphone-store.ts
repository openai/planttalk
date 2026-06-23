import { create } from "zustand";

// Microphone device selection for the voice conversation. Mirrors the camera
// picker in camera-store.ts. The selection is read by the conversation store
// when a call starts — switching mics mid-call isn't supported (it would need
// WebRTC track replacement), so a new choice applies to the next call.

export interface MicrophoneDeviceOption {
  deviceId: string;
  label: string;
}

const SELECTED_MIC_STORAGE_KEY = "plant-mic/selected-device-id";

interface MicrophoneState {
  availableMicrophones: MicrophoneDeviceOption[];
  selectedMicrophoneId: string | null;

  refreshMicrophoneList: () => Promise<void>;
  selectMicrophone: (deviceId: string | null) => void;
}

export const useMicrophoneStore = create<MicrophoneState>()((set) => ({
  availableMicrophones: [],
  selectedMicrophoneId:
    typeof localStorage !== "undefined" ? localStorage.getItem(SELECTED_MIC_STORAGE_KEY) : null,

  refreshMicrophoneList: async () => {
    if (!("mediaDevices" in navigator) || typeof navigator.mediaDevices.enumerateDevices !== "function") {
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const microphones = devices
        // Before mic permission is granted, the browser reports devices with
        // empty deviceIds — those can't be selected, so skip them. The real
        // list (with labels) appears after the first conversation starts.
        .filter((device) => device.kind === "audioinput" && device.deviceId)
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${index + 1}`,
        }));
      set({ availableMicrophones: microphones });
    } catch (error) {
      console.warn("[mic] Could not enumerate microphones:", error);
    }
  },

  selectMicrophone: (deviceId) => {
    set({ selectedMicrophoneId: deviceId });

    if (typeof localStorage !== "undefined") {
      if (deviceId) {
        localStorage.setItem(SELECTED_MIC_STORAGE_KEY, deviceId);
      } else {
        localStorage.removeItem(SELECTED_MIC_STORAGE_KEY);
      }
    }
  },
}));
