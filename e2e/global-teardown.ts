import { rmSync } from "node:fs";

import { dropSchema } from "./fixtures/database.js";
import { datasourceMarkerPath } from "./fixtures/environment.js";

export default async function globalTeardown(): Promise<void> {
  // Playwright runs this hook before it stops the webServer processes, so a
  // schema dropped here vanishes under a still-running API. Runs started by
  // scripts/run.mjs drop the schema after Playwright exits instead.
  if (process.env.E2E_MANAGED_TEARDOWN === "1") {
    process.stdout.write(
      "\n[e2e] the run schema is dropped by scripts/run.mjs after the servers stop\n",
    );
    return;
  }

  const schema = process.env.E2E_SCHEMA;
  const adminUrl = process.env.E2E_ADMIN_DATABASE_URL;

  if (!schema || !adminUrl) {
    return;
  }

  try {
    await dropSchema(adminUrl, schema);
    rmSync(datasourceMarkerPath(), { force: true });
    process.stdout.write(`\n[e2e] dropped PostgreSQL schema: ${schema}\n`);
  } catch (error) {
    process.stderr.write(
      `\n[e2e] failed to drop schema ${schema}: ${String(error)}\n`,
    );
  }
}
