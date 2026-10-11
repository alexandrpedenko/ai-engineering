import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Two test projects: "node" for core, server and the repo guards; "web" for
// the React app in a simulated browser (jsdom).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.ts", "packages/core/tests/**/*.test.ts", "packages/server/tests/**/*.test.ts"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "web",
          environment: "jsdom",
          include: ["packages/web/tests/**/*.test.{ts,tsx}"],
          setupFiles: ["packages/web/tests/setup.ts"],
        },
      },
    ],
  },
});
