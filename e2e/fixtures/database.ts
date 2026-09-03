import { randomBytes } from "node:crypto";

import { Client } from "pg";

/**
 * Every end-to-end run operates inside its own PostgreSQL schema so that runs are
 * isolated and repeatable. The schema is created before the servers start and
 * dropped in global teardown.
 */

const SCHEMA_PREFIX = "e2e_";
const SCHEMA_PATTERN = /^[a-z0-9_]+$/;

export function createSchemaName(): string {
  return `${SCHEMA_PREFIX}${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export function assertSchemaName(schema: string): void {
  if (!SCHEMA_PATTERN.test(schema) || !schema.startsWith(SCHEMA_PREFIX)) {
    throw new Error(`Refusing to operate on unexpected schema name: ${schema}`);
  }
}

/** Return `baseUrl` with its `schema` search parameter replaced. */
export function withSchema(baseUrl: string, schema: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("schema", schema);
  return url.toString();
}

async function withClient<T>(
  connectionString: string,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export async function createSchema(
  adminUrl: string,
  schema: string,
): Promise<void> {
  assertSchemaName(schema);
  await withClient(adminUrl, (client) =>
    client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`),
  );
}

export async function dropSchema(
  adminUrl: string,
  schema: string,
): Promise<void> {
  assertSchemaName(schema);
  await withClient(adminUrl, (client) =>
    client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`),
  );
}

/** Read the `schema` search parameter from a PostgreSQL connection string. */
export function schemaOf(connectionString: string): string {
  return new URL(connectionString).searchParams.get("schema") ?? "public";
}

export async function countAppliedMigrations(
  connectionString: string,
): Promise<number> {
  const schema = schemaOf(connectionString);
  assertSchemaName(schema);
  return withClient(connectionString, async (client) => {
    // node-postgres ignores the `schema` connection parameter, so scope explicitly.
    await client.query(`SET search_path TO "${schema}"`);
    const result = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    return Number(result.rows[0]?.count ?? "0");
  });
}
