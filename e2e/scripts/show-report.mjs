import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const runId = process.env.E2E_RUN_ID;
if (!runId) {
  throw new Error(
    "Set E2E_RUN_ID to the run printed by `pnpm e2e` before opening its report.",
  );
}

const reportDirectory = resolve(".runs", runId, "playwright-report");
if (!existsSync(reportDirectory)) {
  throw new Error(`No Playwright report exists for E2E_RUN_ID=${runId}.`);
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
execFileSync(pnpm, ["exec", "playwright", "show-report", reportDirectory], {
  stdio: "inherit",
});
