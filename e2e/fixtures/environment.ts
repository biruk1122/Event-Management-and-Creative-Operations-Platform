import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

import { config as loadDotenv } from "dotenv";

const currentDir = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(currentDir, "..", "..");

/** Load the repository `.env` without overriding values already in the environment (CI sets them). */
export function loadRepositoryEnv(): void {
  const envPath = resolve(repositoryRoot, ".env");
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath });
  }
}

const WEB_PORT = process.env.WEB_PORT ?? "3000";
const API_PORT = process.env.API_PORT ?? "4000";
const HOST = "127.0.0.1";
const RUN_ID_PATTERN = /^[a-z0-9_]+$/;

/**
 * `scripts/run.mjs` provides a random ID for each invocation. Keeping every
 * marker and artifact below that ID prevents concurrent e2e commands from
 * sharing state. The fallback supports inspecting an already provisioned run
 * manually, but normal execution must use the package scripts.
 */
export const e2eRunId = process.env.E2E_RUN_ID ?? "local";

if (!RUN_ID_PATTERN.test(e2eRunId)) {
  throw new Error(
    "E2E_RUN_ID may contain only lower-case letters, digits, and underscores.",
  );
}

export const webBaseUrl = `http://${HOST}:${WEB_PORT}`;
export const apiBaseUrl = `http://${HOST}:${API_PORT}`;
export const apiReadinessUrl = `${apiBaseUrl}/health/ready`;
export const webPort = WEB_PORT;

export function runDirectory(): string {
  return resolve(repositoryRoot, "e2e", ".runs", e2eRunId);
}

/**
 * The base PostgreSQL URL the harness derives per-run schemas from.
 * `scripts/provision.mjs` replaces its `schema` parameter with a unique value
 * before Playwright starts.
 */
export function baseDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required to run the end-to-end harness. Start PostgreSQL and set it in .env.",
    );
  }
  return url;
}

/**
 * Where `scripts/provision.mjs` records the schema it created, migrated, and
 * seeded: `{ schema, databaseUrl, adminUrl }`. Playwright starts `webServer`
 * processes *before* running its `globalSetup` hook, so anything the servers
 * need at boot has to exist on disk before `playwright test` is even
 * invoked - `playwright.config.ts` reads this file synchronously to build the
 * servers' env, and `global-setup.ts` reads it again to republish the values
 * onto the test runner's own `process.env` for test files and
 * `global-teardown.ts`. Deliberately outside `test-results/`: Playwright
 * empties its `outputDir` at startup, which would delete the marker before
 * `global-setup.ts` gets to read it.
 */
export function datasourceMarkerPath(): string {
  return resolve(runDirectory(), "datasource.json");
}

/**
 * Non-database environment shared by the API and web servers Playwright builds
 * and starts, with test-safe defaults. `DATABASE_URL` is added separately by
 * `playwright.config.ts` from {@link datasourceMarkerPath}.
 */
export function serverEnv(): Record<string, string> {
  const defaults: Record<string, string> = {
    NODE_ENV: "production",
    API_HOST: HOST,
    API_PORT,
    WEB_PORT,
    LOG_LEVEL: "silent",
    CORS_ORIGINS: webBaseUrl,
    // The suite has grown across many merged epics (EVT, WSP, PRJ, RBAC,
    // TASK, RTC, ...); a full run's request volume within any 60s window now
    // exceeds 1000, tripping the limiter mid-suite with unrelated 429s in
    // specs that never touch the feature actually under test. Raised with
    // headroom for the epics still to come, not tuned to today's exact
    // count. Keep this in sync with the `end-to-end` job's own
    // `API_RATE_LIMIT_MAX` in `.github/workflows/foundation-ci.yml`, which
    // is what actually governs CI - see the note on `resolved` below for why
    // this default alone does not.
    API_RATE_LIMIT_MAX: "10000",
    API_RATE_LIMIT_TTL_MS: "60000",
    AUTH_ACCESS_TOKEN_SECRET: "e2e-access-token-secret-at-least-32-characters",
    AUTH_ACCESS_TOKEN_TTL: "15m",
    AUTH_REFRESH_TOKEN_SECRET:
      "e2e-refresh-token-secret-at-least-32-characters",
    AUTH_REFRESH_TOKEN_TTL: "30d",
    AUTH_COOKIE_SECURE: "false",
    AUTH_COOKIE_SAME_SITE: "lax",
    FILE_STORAGE_ENDPOINT: "http://127.0.0.1:9000",
    FILE_STORAGE_REGION: "us-east-1",
    FILE_STORAGE_BUCKET: "event-platform-files",
    FILE_STORAGE_ACCESS_KEY: "minioadmin",
    FILE_STORAGE_SECRET_KEY: "minioadmin",
    FILE_STORAGE_FORCE_PATH_STYLE: "true",
    API_INTERNAL_URL: `${apiBaseUrl}/api/v1`,
    NEXT_PUBLIC_API_URL: `${apiBaseUrl}/api/v1`,
    NEXT_PUBLIC_WS_URL: apiBaseUrl,
  };

  // An already-set ambient value always wins over the default above -
  // including the repository `.env` (loaded by `loadRepositoryEnv()` before
  // this runs) if that file happens to set the same key. A locally copied
  // `.env` with its own `API_RATE_LIMIT_MAX` therefore silently overrides
  // this function's own curated default; only CI, which sets no such file,
  // is actually governed by the value above. Confirming a change to a key
  // also set in `.env` needs a real run, not just reading this function.
  const resolved: Record<string, string> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const fromEnv = process.env[key];
    if (fromEnv && fromEnv.length > 0) {
      resolved[key] = fromEnv;
    }
  }
  return resolved;
}
