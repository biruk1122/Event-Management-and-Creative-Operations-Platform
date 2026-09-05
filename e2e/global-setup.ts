import { readFileSync } from "node:fs";

import {
  datasourceMarkerPath,
  loadRepositoryEnv,
} from "./fixtures/environment.js";

interface ProvisionedDatasource {
  schema: string;
  databaseUrl: string;
  adminUrl: string;
}

/**
 * `scripts/provision.mjs` runs before `playwright test` (see the "e2e" script
 * in package.json) and creates, migrates, and seeds this run's isolated
 * schema, because Playwright starts `webServer` processes *before* running
 * this hook - too late to hand a freshly created `DATABASE_URL` to servers
 * that already booted. This hook only republishes that already-provisioned
 * result onto the test runner's own `process.env`, for test files and
 * `global-teardown.ts`.
 */
export default function globalSetup(): void {
  loadRepositoryEnv();

  const markerPath = datasourceMarkerPath();
  let datasource: ProvisionedDatasource;
  try {
    datasource = JSON.parse(
      readFileSync(markerPath, "utf8"),
    ) as ProvisionedDatasource;
  } catch (error) {
    throw new Error(
      `Could not read ${markerPath}. Run "node scripts/provision.mjs" first ` +
        '(the "e2e" script does this automatically) before "playwright test".',
      { cause: error },
    );
  }

  process.env.DATABASE_URL = datasource.databaseUrl;
  process.env.E2E_SCHEMA = datasource.schema;
  process.env.E2E_ADMIN_DATABASE_URL = datasource.adminUrl;

  process.stdout.write(
    `\n[e2e] using isolated PostgreSQL schema: ${datasource.schema}\n`,
  );
}
