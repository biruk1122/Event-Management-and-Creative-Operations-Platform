import { execSync } from "node:child_process";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

describe("marketing campaign schema", () => {
  let db: IsolatedDatabase;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
  });
  afterAll(async () => {
    await db?.drop();
  });

  async function campaign(type = "MARKETING") {
    const [workspace] = await db.query<{ id: string }>(
      "INSERT INTO workspaces (kind) VALUES ('CAMPAIGN') RETURNING id",
    );
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO campaigns (workspace_id, name, campaign_type, budget_amount, budget_currency)
       VALUES ($1, 'Launch', $2, 1250.00, 'ETB') RETURNING id`,
      [workspace!.id, type],
    );
    return row!.id;
  }

  it("applies all migrations to a clean PostgreSQL schema", () => {
    const output = execSync("pnpm exec prisma migrate status", {
      cwd: resolve(import.meta.dirname, ".."),
      env: { ...process.env, DATABASE_URL: db.url },
      encoding: "utf8",
    });
    expect(output).toContain("Database schema is up to date");
  });

  it("stores strategy without duplicating campaign money, state, activities, or workspace", async () => {
    const id = await campaign();
    await db.query(
      "INSERT INTO marketing_campaigns (campaign_id, strategy) VALUES ($1, $2)",
      [id, "Reach new audiences through local partnerships"],
    );
    const rows = await db.query<{
      strategy: string;
      budget_amount: string;
      budget_currency: string;
      status: string;
      kind: string;
    }>(
      `SELECT m.strategy, c.budget_amount, c.budget_currency, c.status, w.kind
       FROM marketing_campaigns m
       JOIN campaigns c ON c.id = m.campaign_id
       JOIN workspaces w ON w.id = c.workspace_id
       WHERE m.campaign_id = $1`,
      [id],
    );
    expect(rows).toEqual([
      {
        strategy: "Reach new audiences through local partnerships",
        budget_amount: "1250.00",
        budget_currency: "ETB",
        status: "PLANNED",
        kind: "CAMPAIGN",
      },
    ]);
    const columns = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'marketing_campaigns'`,
      [db.schema],
    );
    expect(columns.map((row) => row.column_name).sort()).toEqual([
      "campaign_id",
      "campaign_type",
      "created_at",
      "strategy",
      "updated_at",
    ]);
  });

  it("enforces one strategy per marketing campaign and rejects promotion or missing owners", async () => {
    const marketing = await campaign();
    const promotion = await campaign("PROMOTION");
    const insert = (id: string, strategy = "Partner outreach") =>
      db.query(
        "INSERT INTO marketing_campaigns (campaign_id, strategy) VALUES ($1, $2)",
        [id, strategy],
      );
    await insert(marketing);
    await expect(insert(marketing)).rejects.toMatchObject({
      code: PG_ERROR.uniqueViolation,
    });
    await expect(insert(promotion)).rejects.toMatchObject({
      code: PG_ERROR.foreignKeyViolation,
    });
    await expect(
      insert("00000000-0000-0000-0000-000000000000"),
    ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    await expect(
      db.query(
        "UPDATE marketing_campaigns SET campaign_type = 'PROMOTION' WHERE campaign_id = $1",
        [marketing],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await expect(
      db.query(
        "UPDATE campaigns SET campaign_type = 'PROMOTION' WHERE id = $1",
        [marketing],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
  });

  it("rejects blank strategy and invalid shared campaign money or state", async () => {
    const id = await campaign();
    await expect(
      db.query(
        "INSERT INTO marketing_campaigns (campaign_id, strategy) VALUES ($1, '  ')",
        [id],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await expect(
      db.query("UPDATE campaigns SET budget_amount = -1 WHERE id = $1", [id]),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await expect(
      db.query("UPDATE campaigns SET budget_currency = NULL WHERE id = $1", [
        id,
      ]),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await expect(
      db.query("UPDATE campaigns SET status = 'UNKNOWN' WHERE id = $1", [id]),
    ).rejects.toMatchObject({ code: PG_ERROR.invalidTextRepresentation });
  });

  it("removes marketing detail with the campaign", async () => {
    const id = await campaign();
    await db.query(
      "INSERT INTO marketing_campaigns (campaign_id, strategy) VALUES ($1, 'Partner outreach')",
      [id],
    );
    await db.query("DELETE FROM campaigns WHERE id = $1", [id]);
    expect(
      await db.query(
        "SELECT 1 FROM marketing_campaigns WHERE campaign_id = $1",
        [id],
      ),
    ).toHaveLength(0);
  });
});
