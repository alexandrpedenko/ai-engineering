import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const serverPort = process.env.ORCH_PORT ?? "4317";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // changeOrigin: false keeps the browser's Host header (localhost:5173), so
    // the server sees the request addressed to the page's own origin, which
    // is the only origin it accepts (ADR-0015).
    proxy: { "/api": { target: `http://127.0.0.1:${serverPort}`, changeOrigin: false } },
  },
});
