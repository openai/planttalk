import http from "node:http";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Reuse a small pool of keep-alive sockets when proxying to the API server.
// Without this, every /api request (including the long-lived /api/observe
// stream) opens a brand-new socket; on Windows that churn can exhaust the
// socket buffers and fail with ENOBUFS, after which requests hang.
const apiProxyAgent = new http.Agent({ keepAlive: true, maxSockets: 64 });

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  server: {
    host: true,
    port: 3000,
    // API requests go to the Express server (server/index.ts) during development.
    // Target 127.0.0.1 (not "localhost") so Node doesn't attempt a dual-stack
    // IPv6+IPv4 connect, which is the other half of the ENOBUFS failure.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        agent: apiProxyAgent,
      },
    },
  },
});
