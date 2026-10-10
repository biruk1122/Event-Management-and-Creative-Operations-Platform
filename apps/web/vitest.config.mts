import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Next aliases this marker during server builds; Vite needs the same empty
    // marker to test server entry functions without importing client-only code.
    alias: {
      "server-only": fileURLToPath(
        new URL(
          "./node_modules/next/dist/compiled/server-only/empty.js",
          import.meta.url,
        ),
      ),
    },
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Radix dialogs driven through `userEvent` re-render on every simulated
    // keystroke; under full-suite parallelism on a loaded CI runner the
    // heavier interaction flows brush past the 5s default.
    testTimeout: 15_000,
  },
});
