// Plain JavaScript, run directly with `node` (see the "e2e" script in
// package.json) - deliberately not TypeScript. Playwright starts `webServer`
// processes *before* it runs its own `globalSetup` hook, so the isolated
// schema those servers boot against has to exist before `playwright test` is
// even invoked. Node's runtime does not resolve the `.js`-suffixed relative
// specifiers the rest of this package's TypeScript uses (only Playwright's
// own loader does that), so this script is self-contained rather than
// importing sibling fixtures.
import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { hash } from "@node-rs/argon2";
import { config as loadDotenv } from "dotenv";
import { Client } from "pg";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDir, "..", "..");

const envPath = resolve(repositoryRoot, ".env");
if (existsSync(envPath)) {
  loadDotenv({ path: envPath });
}

const SCHEMA_PREFIX = "e2e_";

// The canonical end-to-end accounts. Mirrors `fixtures/test-users.ts`, the
// source of truth for their shape and intent; duplicated here as literals
// because this script cannot import that file at runtime (see header comment).
// Keep the emails and password in sync with `fixtures/test-users.ts`.
const TEST_USER_PASSWORD = "e2e-Passw0rd!";
const TEST_USER_EMAILS = [
  "super-admin@e2e.test",
  "manager@e2e.test",
  "member@e2e.test",
];

function baseDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required to run the end-to-end harness. Start PostgreSQL and set it in .env.",
    );
  }
  return url;
}

function withSchema(baseUrl, schema) {
  const url = new URL(baseUrl);
  url.searchParams.set("schema", schema);
  return url.toString();
}

async function withClient(connectionString, run) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function main() {
  const base = baseDatabaseUrl();
  const schema = `${SCHEMA_PREFIX}${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
  const adminUrl = withSchema(base, "public");
  const scopedUrl = withSchema(base, schema);

  await withClient(adminUrl, (client) =>
    client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`),
  );

  execSync("pnpm --filter @event-platform/api exec prisma migrate deploy", {
    cwd: repositoryRoot,
    env: { ...process.env, DATABASE_URL: scopedUrl },
    stdio: "inherit",
  });

  await withClient(scopedUrl, async (client) => {
    await client.query(`SET search_path TO "${schema}"`);
    for (const email of TEST_USER_EMAILS) {
      const passwordHash = await hash(TEST_USER_PASSWORD);
      const { rows } = await client.query(
        `INSERT INTO users (email, status) VALUES ($1, 'ACTIVE') RETURNING id`,
        [email.toLowerCase()],
      );
      const id = rows[0]?.id;
      if (!id) {
        throw new Error(`Failed to seed end-to-end user ${email}.`);
      }
      await client.query(
        `INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`,
        [id, passwordHash],
      );
    }
  });

  // Deliberately outside test-results/: Playwright empties its outputDir at
  // startup, which would delete this marker before global-setup.ts (and
  // playwright.config.ts, which reads it even earlier) can read it.
  writeFileSync(
    resolve(repositoryRoot, "e2e", ".e2e-datasource.json"),
    `${JSON.stringify({ schema, databaseUrl: scopedUrl, adminUrl }, null, 2)}\n`,
    "utf8",
  );

  process.stdout.write(
    `\n[e2e] provisioned isolated PostgreSQL schema: ${schema}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
