import { dropSchema } from "./fixtures/database.js";

export default async function globalTeardown(): Promise<void> {
  const schema = process.env.E2E_SCHEMA;
  const adminUrl = process.env.E2E_ADMIN_DATABASE_URL;

  if (!schema || !adminUrl) {
    return;
  }

  try {
    await dropSchema(adminUrl, schema);
    process.stdout.write(`\n[e2e] dropped PostgreSQL schema: ${schema}\n`);
  } catch (error) {
    process.stderr.write(
      `\n[e2e] failed to drop schema ${schema}: ${String(error)}\n`,
    );
  }
}
