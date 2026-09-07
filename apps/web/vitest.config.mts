import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
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
