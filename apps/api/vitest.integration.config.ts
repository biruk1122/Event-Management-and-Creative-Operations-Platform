import { resolve } from "node:path";

import { config as loadDotenv } from "dotenv";
import { defineConfig } from "vitest/config";

for (const path of [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
]) {
  loadDotenv({ path, quiet: true });
}

// Integration tests must never run against the development database. They use
// INTEGRATION_DATABASE_URL, which must name a dedicated database ending in _test.
const developmentUrl = process.env.DATABASE_URL;
const integrationUrl = process.env.INTEGRATION_DATABASE_URL;
if (!integrationUrl) {
  throw new Error(
    "INTEGRATION_DATABASE_URL is required. Point it at a dedicated test database (name ending in _test), never the development database.",
  );
}
const integrationName = new URL(integrationUrl).pathname.slice(1);
if (!integrationName.endsWith("_test")) {
  throw new Error(
    `INTEGRATION_DATABASE_URL must name a database ending in _test; got "${integrationName}".`,
  );
}
if (
  developmentUrl &&
  new URL(developmentUrl).pathname.slice(1) === integrationName
) {
  throw new Error(
    `INTEGRATION_DATABASE_URL names the development database "${integrationName}". Refusing to run.`,
  );
}
process.env.DATABASE_URL = integrationUrl;

/**
 * Database integration suite. Requires a reachable PostgreSQL 18 in
 * `DATABASE_URL`; each spec provisions and drops its own schema. Runs in the
 * PostgreSQL CI job and locally via `pnpm test:integration`.
 */
export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_URL: integrationUrl,
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
