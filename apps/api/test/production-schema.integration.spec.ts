import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

describe("production management schema", () => {
  let db: IsolatedDatabase;
  beforeAll(async () => {
    db = await createIsolatedDatabase();
  });
  afterAll(async () => {
    await db?.drop();
  });

  async function workspace(): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      "INSERT INTO workspaces (kind) VALUES ('PRODUCTION') RETURNING id",
    );
    return row!.id;
  }
  async function production() {
    const [row] = await db.query<{ id: string }>(
      "INSERT INTO productions (workspace_id, name, production_type) VALUES ($1, 'Launch film', 'Video') RETURNING id",
      [await workspace()],
    );
    return row!.id;
  }
  it("enforces one production per workspace and date/type invariants", async () => {
    const id = await workspace();
    await db.query(
      "INSERT INTO productions (workspace_id, name, production_type, start_at, end_at) VALUES ($1, 'Shoot', 'Video', '2026-01-02T00:00:00Z', '2026-01-03T00:00:00Z')",
      [id],
    );
    await expect(
      db.query(
        "INSERT INTO productions (workspace_id, name, production_type) VALUES ($1, 'Again', 'Video')",
        [id],
      ),
    ).rejects.toBeTruthy();
    await expect(
      db.query(
        "INSERT INTO productions (workspace_id, name, production_type) VALUES ($1, 'Bad', '  ')",
        [await workspace()],
      ),
    ).rejects.toBeTruthy();
    await expect(
      db.query(
        "INSERT INTO productions (workspace_id, name, production_type, start_at, end_at) VALUES ($1, 'Bad dates', 'Video', '2026-01-03T00:00:00Z', '2026-01-02T00:00:00Z')",
        [await workspace()],
      ),
    ).rejects.toBeTruthy();
  });
  it("enforces explicit production talent relations", async () => {
    const [talent] = await db.query<{ id: string }>(
      "INSERT INTO talents (full_name, type) VALUES ('Artist', 'ARTIST') RETURNING id",
    );
    const id = await production();
    await db.query(
      "INSERT INTO production_talents (production_id, talent_id, role) VALUES ($1, $2, 'Lead')",
      [id, talent!.id],
    );
    await expect(
      db.query(
        "INSERT INTO production_talents (production_id, talent_id, role) VALUES ($1, $2, 'Backup')",
        [id, talent!.id],
      ),
    ).rejects.toBeTruthy();
  });
});
