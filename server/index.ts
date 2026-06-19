// Express server — the only backend this project needs.
//
// Two jobs:
//   1. Keep the OpenAI API key on the server (the browser never sees it).
//   2. Serve the built SPA in production (`npm run build` then `npm start`).
//
// In development, Vite serves the app on :3000 and proxies `/api/*` here
// (see vite.config.ts). Run both with `npm run dev`.

import "./env"; // must stay the first import — loads .env before anything reads it
import path from "node:path";
import express from "express";
import { handleAnalyzeRequest, handleObserveRequest } from "./observe";
import { handleRealtimeTokenRequest } from "./realtime";

const PORT = Number(process.env.PORT ?? 3001);

const app = express();

// Camera frames arrive as base64 data URLs inside JSON bodies, so the
// default 100kb body limit is far too small.
app.use(express.json({ limit: "12mb" }));

// POST /api/analyze — one-shot image → structured plant attributes (the upload tester).
app.post("/api/analyze", handleAnalyzeRequest);

// POST /api/observe — camera frame + sensor readings + history → structured
// observation. Optionally streams the model's reasoning summaries as NDJSON.
app.post("/api/observe", handleObserveRequest);

// POST /api/realtime-token — mints a short-lived client secret so the browser
// can open a WebRTC voice session with the Realtime API (the plant's voice).
app.post("/api/realtime-token", handleRealtimeTokenRequest);

// In production, serve the static build output and fall back to index.html
// for any non-API path (single-page app).
const distDir = path.join(process.cwd(), "dist");
app.use(express.static(distDir));
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn("[server] OPENAI_API_KEY is not set — API calls will fail. Add it to .env");
  }
});
