import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Tests must not read a developer's own settings.json or .env (API keys):
// point the orchestrator at files that don't exist, so every test starts from
// defaults and no test can reach a real model by accident.
const noSettings = fileURLToPath(new URL("./tests/no-such-settings.json", import.meta.url));
const noEnv = fileURLToPath(new URL("./tests/no-such.env", import.meta.url));

// Two test projects: "node" for core, server and the repo guards; "web" for
// the React app in a simulated browser (jsdom).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          env: { ORCH_SETTINGS_FILE: noSettings, ORCH_ENV_FILE: noEnv },
          include: ["tests/**/*.test.ts", "packages/core/tests/**/*.test.ts", "packages/server/tests/**/*.test.ts"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "web",
          environment: "jsdom",
          env: { ORCH_SETTINGS_FILE: noSettings, ORCH_ENV_FILE: noEnv },
          include: ["packages/web/tests/**/*.test.{ts,tsx}"],
          setupFiles: ["packages/web/tests/setup.ts"],
        },
      },
    ],
  },
});
