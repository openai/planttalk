import { PlantDashboard } from "@/components/dashboard/plant-dashboard";
import { AmbientExperience } from "@/components/public/public-experience";
import { useUiModeStore } from "@/stores/plant/ui-mode-store";
import { PLANT_NAME } from "@/lib/plant/realtime-config";

// Single-page app, no router needed. Ambient mode sits on top of the dashboard
// so the camera, sensors, observation loop, and conversation state keep running.
export function App() {
  const mode = useUiModeStore((state) => state.mode);
  const setMode = useUiModeStore((state) => state.setMode);

  return (
    <>
      <header className="container">
        <h1>Talk to {PLANT_NAME} 🪴</h1>
        <p>
          A houseplant with sensors, a camera, a memory, and opinions - powered by the OpenAI API. This dashboard shows
          everything the system is doing.
        </p>
        <button type="button" className="secondary outline" onClick={() => setMode("ambient")}>
          Open ambient mode
        </button>
      </header>
      <main>
        <PlantDashboard />
      </main>
      {mode === "ambient" && <AmbientExperience onExit={() => setMode("dashboard")} />}
    </>
  );
}
