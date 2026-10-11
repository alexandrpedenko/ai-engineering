import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const serverPort = process.env.ORCH_PORT ?? "4317";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": `http://localhost:${serverPort}` },
  },
});
