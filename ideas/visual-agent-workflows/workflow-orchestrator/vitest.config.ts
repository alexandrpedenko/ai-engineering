import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Tests must not read a developer's own settings.json: point the orchestrator
// at a settings file that doesn't exist, so every test starts from defaults.
const noSettings = fileURLToPath(new URL("./tests/no-such-settings.json", import.meta.url));

// Two test projects: "node" for core, server and the repo guards; "web" for
// the React app in a simulated browser (jsdom).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          env: { ORCH_SETTINGS_FILE: noSettings },
          include: ["tests/**/*.test.ts", "packages/core/tests/**/*.test.ts", "packages/server/tests/**/*.test.ts"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "web",
          environment: "jsdom",
          env: { ORCH_SETTINGS_FILE: noSettings },
          include: ["packages/web/tests/**/*.test.{ts,tsx}"],
          setupFiles: ["packages/web/tests/setup.ts"],
        },
      },
    ],
  },
});
