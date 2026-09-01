import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
    },
    environment: "node",
    env: {
      DATABASE_URL:
        "postgresql://event_platform:change-me@localhost:5432/event_platform?schema=public",
      NODE_ENV: "test",
    },
    hookTimeout: 60_000,
    include: ["test/**/*.spec.ts", "src/**/*.spec.ts"],
    restoreMocks: true,
  },
});
