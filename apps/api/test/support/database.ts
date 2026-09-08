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
const SCHEMA_PREFIX = "it_";
const SCHEMA_PATTERN = /^[a-z0-9_]+$/;

export interface IsolatedDatabase {
  schema: string;
  url: string;
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<T[]>;
  /** Remove application rows between tests while preserving migrations. */
  reset: () => Promise<void>;
  drop: () => Promise<void>;
}

function assertSchemaName(schema: string): void {
  if (!SCHEMA_PATTERN.test(schema) || !schema.startsWith(SCHEMA_PREFIX)) {
    throw new Error(`Refusing to operate on unexpected schema name: ${schema}`);
  }
}

function withSchema(baseUrl: string, schema: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("schema", schema);
  return url.toString();
}

async function runOnce(url: string, text: string): Promise<void> {
  await withClient(url, async (client) => {
    await client.query(text);
  });
}

async function withClient<T>(
  url: string,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export async function createIsolatedDatabase(): Promise<IsolatedDatabase> {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error("DATABASE_URL is required for database integration tests.");
  }

  const schema = `${SCHEMA_PREFIX}${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
  assertSchemaName(schema);
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
    async reset() {
      await withClient(url, async (client) => {
        // node-postgres ignores the Prisma `schema` URL parameter, so scope
        // the destructive cleanup statement explicitly.
        await client.query(`SET search_path TO "${schema}"`);
        const result = await client.query<{ table_name: string }>(
          `SELECT table_name
             FROM information_schema.tables
            WHERE table_schema = $1
              AND table_type = 'BASE TABLE'
              AND table_name <> '_prisma_migrations'
            ORDER BY table_name`,
          [schema],
        );
        if (result.rows.length === 0) {
          return;
        }
        const tables = result.rows
          .map((row) => quoteIdentifier(row.table_name))
          .join(", ");
        await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
      });
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
