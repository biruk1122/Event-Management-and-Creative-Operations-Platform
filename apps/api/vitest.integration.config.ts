import { resolve } from "node:path";

import { config as loadDotenv } from "dotenv";
import { defineConfig } from "vitest/config";

for (const path of [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
]) {
  loadDotenv({ path, quiet: true });
}

/**
 * Database integration suite. Requires a reachable PostgreSQL 18 in
 * `DATABASE_URL`; each spec provisions and drops its own schema. Runs in the
 * PostgreSQL CI job and locally via `pnpm test:integration`.
 */
export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      NODE_ENV: "test",
    },
    hookTimeout: 120_000,
    testTimeout: 30_000,
    include: ["test/**/*.integration.spec.ts"],
    // Each suite gets its own schema and fork, but Prisma's migration advisory
    // lock is database-wide. Parallel file startup can exhaust its fixed 10s
    // wait (even with retries), so provision one isolated schema at a time.
    pool: "forks",
    fileParallelism: false,
    restoreMocks: true,
  },
});
