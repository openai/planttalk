import { create } from "zustand";
import { captureFrameFromStream } from "@/lib/plant/camera-capture";

// Owns the webcam MediaStream. Kept separate from the observation loop because
// more than one feature needs the camera: the periodic observation loop grabs
// frames from it, the dashboard previews it, and a future conversation tool
// could snapshot it.

export type LiveCameraStatus = "idle" | "starting" | "ready" | "unsupported" | "error";

export interface CameraDeviceOption {
  deviceId: string;
  label: string;
}

const SELECTED_CAMERA_STORAGE_KEY = "plant-camera/selected-device-id";

interface PlantCameraState {
  cameraStream: MediaStream | null;
  cameraStatus: LiveCameraStatus;
  cameraError: string | null;
  availableCameras: CameraDeviceOption[];
  selectedCameraId: string | null;

  startCamera: () => Promise<void>;
  stopCamera: () => void;
  refreshCameraList: () => Promise<void>;
  selectCamera: (deviceId: string | null) => void;
  autoStartIfPermitted: () => Promise<void>;
}

// Auto-start runs at most once per page load — guards against React StrictMode
// double-mount and against fighting a user who manually stops the camera.
let autoStartAttempted = false;

export const usePlantCameraStore = create<PlantCameraState>()((set, get) => ({
  cameraStream: null,
  cameraStatus: "idle",
  cameraError: null,
  availableCameras: [],
  selectedCameraId: typeof localStorage !== "undefined" ? localStorage.getItem(SELECTED_CAMERA_STORAGE_KEY) : null,

  startCamera: async () => {
    if (!("mediaDevices" in navigator) || typeof navigator.mediaDevices.getUserMedia !== "function") {
      set({
        cameraStatus: "unsupported",
        cameraError: "This browser does not expose webcam access.",
      });
      return;
    }

    set({ cameraStatus: "starting", cameraError: null });

    const { selectedCameraId } = get();
    // Pin to the chosen camera when one is selected; otherwise let the browser
    // pick its default device.
    const deviceConstraint = selectedCameraId ? { deviceId: { exact: selectedCameraId } } : {};

    try {
      // Ask for HD first; fall back to whatever the camera offers below.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          ...deviceConstraint,
          height: { ideal: 1080 },
          width: { ideal: 1920 },
        },
      });

      get().cameraStream?.getTracks().forEach((track) => track.stop());
      set({ cameraStream: stream, cameraStatus: "ready" });
    } catch (error) {
      console.warn("[camera] Ideal constraints failed, trying basic constraints:", error);

      try {
        // Keep the device pin if there is one — only relax the resolution. If
        // the pinned camera itself is gone (unplugged), this fails too and the
        // user can pick another from the dropdown.
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: selectedCameraId ? deviceConstraint : true,
        });
        get().cameraStream?.getTracks().forEach((track) => track.stop());
        set({ cameraStream: stream, cameraStatus: "ready" });
      } catch (fallbackError) {
        console.error("[camera] Camera access failed:", fallbackError);
        set({
          cameraStatus: "error",
          cameraError:
            fallbackError instanceof Error
              ? fallbackError.message
              : "Unable to access camera. Check permissions and that the camera is not in use.",
        });
        return;
      }
    }

    // Device labels are only exposed after a successful getUserMedia, so this
    // is the moment the dropdown can show real camera names.
    void get().refreshCameraList();
  },

  stopCamera: () => {
    get().cameraStream?.getTracks().forEach((track) => track.stop());
    set({ cameraStream: null, cameraStatus: "idle" });
  },

  refreshCameraList: async () => {
    if (!("mediaDevices" in navigator) || typeof navigator.mediaDevices.enumerateDevices !== "function") {
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices
        // Before camera permission is granted, the browser reports devices
        // with empty deviceIds — those can't be selected, so skip them. The
        // real list (with labels) appears after the first successful start.
        .filter((device) => device.kind === "videoinput" && device.deviceId)
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${index + 1}`,
        }));
      set({ availableCameras: cameras });
    } catch (error) {
      console.warn("[camera] Could not enumerate cameras:", error);
    }
  },

  selectCamera: (deviceId) => {
    set({ selectedCameraId: deviceId });

    if (typeof localStorage !== "undefined") {
      if (deviceId) {
        localStorage.setItem(SELECTED_CAMERA_STORAGE_KEY, deviceId);
      } else {
        localStorage.removeItem(SELECTED_CAMERA_STORAGE_KEY);
      }
    }

    // If the camera is currently running, restart it on the new device.
    const { cameraStatus, startCamera } = get();
    if (cameraStatus === "ready" || cameraStatus === "starting") {
      void startCamera();
    }
  },

  // Start the camera automatically ONLY when permission was already granted
  // in a previous session — so a returning user (or a kiosk that reloaded)
  // gets the feed back without clicking, but a first-time visitor is never hit
  // with a surprise permission prompt on page load.
  autoStartIfPermitted: async () => {
    if (autoStartAttempted) return;
    autoStartAttempted = true;

    // The Permissions API is the only way to check without prompting. Its
    // "camera" descriptor isn't supported everywhere (Firefox/Safari may
    // reject) — treat any failure as "don't auto-start" and keep the button.
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;

    try {
      const status = await navigator.permissions.query({ name: "camera" as PermissionName });
      if (status.state === "granted" && get().cameraStatus === "idle") {
        await get().startCamera();
      }
    } catch {
      // Permissions API doesn't support "camera" here — skip silently.
    }
  },
}));

// Grabs the current camera stream at call time, so callers (the observation
// loop, a manual "Observe now" click) never hold a stale stream reference.
export async function captureLiveFrame(): Promise<File> {
  const stream = usePlantCameraStore.getState().cameraStream;
  if (!stream) {
    throw new Error("Camera is not running.");
  }
  return captureFrameFromStream(stream);
}
