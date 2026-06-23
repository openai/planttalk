import { create } from "zustand";

// Which UI is on screen. The dashboard is the working view; ambient mode is a
// kiosk-friendly presentation over the same stores and connections.
export type UiMode = "dashboard" | "ambient";

const UI_MODE_STORAGE_KEY = "plant-ui/mode";

function loadInitialMode(): UiMode {
  if (typeof localStorage === "undefined") return "dashboard";
  const savedMode = localStorage.getItem(UI_MODE_STORAGE_KEY);
  return savedMode === "ambient" || savedMode === "public" ? "ambient" : "dashboard";
}

interface UiModeState {
  mode: UiMode;
  setMode: (mode: UiMode) => void;
}

export const useUiModeStore = create<UiModeState>()((set) => ({
  mode: loadInitialMode(),
  setMode: (mode) => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(UI_MODE_STORAGE_KEY, mode);
    }
    set({ mode });
  },
}));
