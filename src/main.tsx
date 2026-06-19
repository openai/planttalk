import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@picocss/pico/css/pico.min.css";
import "./styles.css";
import { App } from "./app";
import { PLANT_NAME } from "@/lib/plant/realtime-config";

// The static index.html can't read the constant — set the title here.
document.title = `Talk to ${PLANT_NAME}`;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
