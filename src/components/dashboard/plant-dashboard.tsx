import { useEffect } from "react";
import { CameraPanel } from "@/components/dashboard/camera-panel";
import { SensorsPanel } from "@/components/dashboard/sensors-panel";
import { ObservationPanel } from "@/components/dashboard/observation-panel";
import { HistoryPanel } from "@/components/dashboard/history-panel";
import { VoiceConversationPanel } from "@/components/dashboard/voice-conversation-panel";
import { DebugPanel } from "@/components/dashboard/debug-panel";
import { PlantUploadPanel } from "@/components/dashboard/plant-upload-panel";
import { PlantAnalysisPanel } from "@/components/dashboard/plant-analysis-panel";
import { captureLiveFrame, usePlantCameraStore } from "@/stores/plant/camera-store";
import { useObservationLoopStore } from "@/stores/plant/observation-loop-store";
import { usePlantSensorsStore } from "@/stores/plant/sensors-store";
import { usePlantSettingsStore } from "@/stores/plant/settings-store";

export function PlantDashboard() {
  const initSensors = usePlantSensorsStore((s) => s.init);
  const cleanupSensors = usePlantSensorsStore((s) => s.cleanup);
  const autoUpdatesEnabled = useObservationLoopStore((s) => s.autoUpdatesEnabled);
  const sendLiveUpdate = useObservationLoopStore((s) => s.sendLiveUpdate);
  const lastUpdatedAt = useObservationLoopStore((s) => s.lastUpdatedAt);
  const cameraStatus = usePlantCameraStore((s) => s.cameraStatus);
  const autoStartCameraIfPermitted = usePlantCameraStore((s) => s.autoStartIfPermitted);
  const observationIntervalMs = usePlantSettingsStore((s) => s.observationIntervalMs);

  // Web Serial setup: reconnects to a remembered Arduino on load.
  useEffect(() => {
    initSensors();
    return () => {
      void cleanupSensors();
    };
  }, [initSensors, cleanupSensors]);

  // Bring the camera back automatically if it was already permitted — a kiosk
  // reload or returning visitor gets the feed without a click (and without a
  // surprise prompt for anyone who hasn't granted access yet).
  useEffect(() => {
    void autoStartCameraIfPermitted();
  }, [autoStartCameraIfPermitted]);

  // The observation loop, in two effects so that adjusting the interval
  // slider only reschedules the timer instead of firing an immediate API call.
  //
  // 1) Kick off one observation when auto-updates turn on with a ready camera.
  useEffect(() => {
    if (!autoUpdatesEnabled || cameraStatus !== "ready") return;
    void sendLiveUpdate("auto", captureLiveFrame);
  }, [autoUpdatesEnabled, cameraStatus, sendLiveUpdate]);

  // 2) Then observe on every interval tick. Including lastUpdatedAt in the
  // deps means a manual "Observe now" resets the timer — no wasted double-call.
  useEffect(() => {
    if (!autoUpdatesEnabled || cameraStatus !== "ready") return;

    const intervalId = setInterval(() => {
      void sendLiveUpdate("auto", captureLiveFrame);
    }, observationIntervalMs);

    return () => clearInterval(intervalId);
  }, [autoUpdatesEnabled, cameraStatus, observationIntervalMs, sendLiveUpdate, lastUpdatedAt]);

  return (
    <section className="dashboard-grid">
      {/* Row 1 (at the 4-column breakpoint): the panels you act on. */}
      <CameraPanel />
      <SensorsPanel />
      <ObservationPanel />
      <VoiceConversationPanel />
      {/* Row 2: outputs and the standalone image tester. */}
      <HistoryPanel />
      <DebugPanel />
      <PlantUploadPanel />
      <PlantAnalysisPanel />
    </section>
  );
}
