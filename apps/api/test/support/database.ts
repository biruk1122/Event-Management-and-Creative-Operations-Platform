import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

import { Client } from "pg";

/**
 * Provision a disposable PostgreSQL schema with the committed migrations
 * applied, for database-level integration tests. Test data and isolation are
 * formalised by EN-06; this helper is the minimum an `*-01` data slice needs to
 * verify its own migration and constraints.
 */

const apiRoot = resolve(import.meta.dirname, "..", "..");

export interface IsolatedDatabase {
  schema: string;
  url: string;
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<T[]>;
  drop: () => Promise<void>;
}

function withSchema(baseUrl: string, schema: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("schema", schema);
  return url.toString();
}

async function runOnce(url: string, text: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(text);
  } finally {
    await client.end();
  }
}

export async function createIsolatedDatabase(): Promise<IsolatedDatabase> {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error("DATABASE_URL is required for database integration tests.");
  }

  const schema = `it_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
  const adminUrl = withSchema(baseUrl, "public");
  const url = withSchema(baseUrl, schema);

  await runOnce(adminUrl, `CREATE SCHEMA "${schema}"`);

  execSync("pnpm exec prisma migrate deploy", {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });

  return {
    schema,
    url,
    async query(text, values) {
      const client = new Client({ connectionString: url });
      await client.connect();
      try {
        await client.query(`SET search_path TO "${schema}"`);
        const result = await client.query(text, values);
        return result.rows as never;
      } finally {
        await client.end();
      }
    },
    async drop() {
      await runOnce(adminUrl, `DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    },
  };
}

/** PostgreSQL SQLSTATE codes asserted by the integration tests. */
export const PG_ERROR = {
  uniqueViolation: "23505",
  foreignKeyViolation: "23503",
  // An explicit `ON DELETE/UPDATE RESTRICT` failure is its own SQLSTATE,
  // distinct from the general foreign-key-violation code above (which covers
  // e.g. inserting a row that references a non-existent parent).
  restrictViolation: "23001",
  checkViolation: "23514",
  notNullViolation: "23502",
} as const;
