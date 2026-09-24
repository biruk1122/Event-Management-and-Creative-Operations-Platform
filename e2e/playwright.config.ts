import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig, devices } from "@playwright/test";

import {
  apiBaseUrl,
  apiReadinessUrl,
  datasourceMarkerPath,
  loadRepositoryEnv,
  runDirectory,
  serverEnv,
  webBaseUrl,
  webPort,
} from "./fixtures/environment.js";

loadRepositoryEnv();

const isCI = Boolean(process.env.CI);
const isManagedRun = Boolean(process.env.E2E_RUN_ID);

// `scripts/provision.mjs` (run by the "e2e" script before this config loads)
// already created, migrated, and seeded the isolated schema; the servers
// below need its connection string in their own spawn env, because
// Playwright starts `webServer` processes before running `globalSetup`.
const { databaseUrl } = JSON.parse(
  readFileSync(datasourceMarkerPath(), "utf8"),
) as { databaseUrl: string };
const sharedEnv = { ...serverEnv(), DATABASE_URL: databaseUrl };
// The web server is a production build, while the API needs the explicitly
// test-only scanner to exercise a real direct-upload/finalize workflow. The
// production API never falls back to this scanner (see FileManagementModule).
const apiEnv = { ...sharedEnv, FILE_SCANNER_MODE: "test", NODE_ENV: "test" };
const webEnv = { ...sharedEnv, NODE_ENV: "production" };

export default defineConfig({
  testDir: "./tests",
  outputDir: resolve(runDirectory(), "test-results"),
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: resolve(runDirectory(), "playwright-report"),
      },
    ],
  ],
  use: {
    baseURL: webBaseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // 10s was tuned against a GitHub-hosted cloud runner; a busy
    // self-hosted machine can occasionally exceed it on real (not
    // stuck) requests.
    actionTimeout: 20_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts$/,
    },
  ],
  webServer: [
    {
      command:
        "pnpm --filter @event-platform/api build && pnpm --filter @event-platform/api exec node --enable-source-maps dist/main.js",
      url: apiReadinessUrl,
      cwd: "..",
      timeout: 180_000,
      // A launcher-managed run has a unique schema and ports. Never attach it
      // to an already-running local server: a rare port race must fail rather
      // than execute against another run's database.
      reuseExistingServer: !isCI && !isManagedRun,
      stdout: "pipe",
      stderr: "pipe",
      env: apiEnv,
    },
    {
      // Webpack also supports linked dependencies in isolated Windows worktrees.
      command: `pnpm --filter @event-platform/web exec next build --webpack && pnpm --filter @event-platform/web exec next start --hostname 127.0.0.1 --port ${webPort}`,
      url: webBaseUrl,
      cwd: "..",
      timeout: 180_000,
      reuseExistingServer: !isCI && !isManagedRun,
      stdout: "pipe",
      stderr: "pipe",
      env: webEnv,
    },
  ],
  metadata: { apiBaseUrl },
});
