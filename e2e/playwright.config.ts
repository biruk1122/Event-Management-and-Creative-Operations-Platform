import { defineConfig, devices } from "@playwright/test";

import {
  apiBaseUrl,
  apiReadinessUrl,
  loadRepositoryEnv,
  serverEnv,
  webBaseUrl,
  webPort,
} from "./fixtures/environment.js";

loadRepositoryEnv();

const isCI = Boolean(process.env.CI);
const sharedEnv = serverEnv();

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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
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
