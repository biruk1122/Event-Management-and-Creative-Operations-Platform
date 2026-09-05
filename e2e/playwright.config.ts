import { readFileSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

import {
  apiBaseUrl,
  apiReadinessUrl,
  datasourceMarkerPath,
  loadRepositoryEnv,
  serverEnv,
  webBaseUrl,
  webPort,
} from "./fixtures/environment.js";

loadRepositoryEnv();

const isCI = Boolean(process.env.CI);

// `scripts/provision.mjs` (run by the "e2e" script before this config loads)
// already created, migrated, and seeded the isolated schema; the servers
// below need its connection string in their own spawn env, because
// Playwright starts `webServer` processes before running `globalSetup`.
const { databaseUrl } = JSON.parse(
  readFileSync(datasourceMarkerPath(), "utf8"),
) as { databaseUrl: string };
const sharedEnv = { ...serverEnv(), DATABASE_URL: databaseUrl };

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
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
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: webBaseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
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
      reuseExistingServer: !isCI,
      stdout: "pipe",
      stderr: "pipe",
      env: sharedEnv,
    },
    {
      command: `pnpm --filter @event-platform/web build && pnpm --filter @event-platform/web exec next start --hostname 127.0.0.1 --port ${webPort}`,
      url: webBaseUrl,
      cwd: "..",
      timeout: 180_000,
      reuseExistingServer: !isCI,
      stdout: "pipe",
      stderr: "pipe",
      env: sharedEnv,
    },
  ],
  metadata: { apiBaseUrl },
});
