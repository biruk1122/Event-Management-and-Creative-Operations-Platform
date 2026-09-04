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
    // Database integration specs need a real PostgreSQL and run via
    // `pnpm test:integration` in the PostgreSQL CI job, not the default suite.
    exclude: ["**/node_modules/**", "test/**/*.integration.spec.ts"],
    restoreMocks: true,
  },
});
