import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  baseDatabaseUrl,
  loadRepositoryEnv,
  repositoryRoot,
} from "./fixtures/environment.js";
import {
  createSchema,
  createSchemaName,
  withSchema,
} from "./fixtures/database.js";
import { seedDatabase } from "./fixtures/seed.js";

export default async function globalSetup(): Promise<void> {
  loadRepositoryEnv();

  const base = baseDatabaseUrl();
  const schema = createSchemaName();
  const adminUrl = withSchema(base, "public");
  const scopedUrl = withSchema(base, schema);

  await createSchema(adminUrl, schema);

  execSync("pnpm --filter @event-platform/api exec prisma migrate deploy", {
    cwd: repositoryRoot,
    env: { ...process.env, DATABASE_URL: scopedUrl },
    stdio: "inherit",
  });

  await seedDatabase(scopedUrl);

  // Hand the isolated datasource to the servers Playwright is about to start.
  process.env.DATABASE_URL = scopedUrl;
  // Hand the schema to global teardown (same process).
  process.env.E2E_SCHEMA = schema;
  process.env.E2E_ADMIN_DATABASE_URL = adminUrl;

  try {
    mkdirSync(resolve(repositoryRoot, "e2e", "test-results"), {
      recursive: true,
    });
    writeFileSync(
      resolve(repositoryRoot, "e2e", "test-results", "e2e-datasource.json"),
      `${JSON.stringify({ schema, databaseUrl: scopedUrl }, null, 2)}\n`,
      "utf8",
    );
  } catch {
    // Diagnostics only; never fail setup because the marker file could not be written.
  }

  process.stdout.write(`\n[e2e] isolated PostgreSQL schema: ${schema}\n`);
}
