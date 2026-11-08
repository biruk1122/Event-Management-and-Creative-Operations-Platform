// Plain JavaScript, run directly with `node` by scripts/run.mjs after
// `playwright test` exits (see provision.mjs for why these scripts are not
// TypeScript).
//
// Why this exists: Playwright tears down in reverse setup order. It starts the
// `webServer` processes first and runs `globalTeardown` before it stops them,
// so a schema dropped in globalTeardown disappears while the API is still
// running. The API's outbox relays poll every two seconds and then log
// "outbox_deliveries does not exist". Dropping the schema here, after the
// Playwright process (and therefore every webServer) has exited, removes that
// race instead of hiding the warnings.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDir, "..", "..");
const RUN_ID_PATTERN = /^[a-z0-9_]+$/;
const SCHEMA_PATTERN = /^e2e_[a-z0-9_]+$/;

async function main() {
  const runId = process.env.E2E_RUN_ID;
  if (!runId || !RUN_ID_PATTERN.test(runId)) {
    process.stderr.write(
      "[e2e] teardown: no valid E2E_RUN_ID; nothing dropped.\n",
    );
    return;
  }
  const marker = resolve(
    repositoryRoot,
    "e2e",
    ".runs",
    runId,
    "datasource.json",
  );
  if (!existsSync(marker)) {
    process.stdout.write(
      "[e2e] teardown: no datasource marker; nothing to drop.\n",
    );
    return;
  }
  const { schema, adminUrl } = JSON.parse(readFileSync(marker, "utf8"));
  const database = new URL(adminUrl).pathname.slice(1);
  // Only ever drop a run schema in a test database.
  if (!database.endsWith("_test") || !SCHEMA_PATTERN.test(schema)) {
    process.stderr.write(
      `[e2e] teardown: refusing to drop schema "${schema}" in database "${database}".\n`,
    );
    process.exitCode = 1;
    return;
  }
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await client.end();
  }
  rmSync(marker, { force: true });
  process.stdout.write(
    `[e2e] dropped PostgreSQL schema after the servers stopped: ${schema}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
