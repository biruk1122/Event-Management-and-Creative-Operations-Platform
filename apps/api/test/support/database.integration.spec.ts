import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createIsolatedDatabase, type IsolatedDatabase } from "./database.js";

describe("isolated database test boundary", () => {
  let database: IsolatedDatabase;

  beforeAll(async () => {
    database = await createIsolatedDatabase();
  });

  afterAll(async () => {
    await database?.drop();
  });

  it("cleans application data without removing committed migrations", async () => {
    await database.query(`INSERT INTO users (email) VALUES ($1)`, [
      "cleanup-proof@test.invalid",
    ]);

    await database.reset();

    const [users] = await database.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM users`,
    );
    const [migrations] = await database.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );

    expect(users?.count).toBe("0");
    expect(Number(migrations?.count)).toBeGreaterThan(0);
  });
});
