import { execSync } from "node:child_process";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

const CHANNELS = [
  "CONTENT_CREATION",
  "SOCIAL_MEDIA",
  "INFLUENCER_MARKETING",
  "RADIO_PROMOTION",
  "TELEVISION",
  "SCREENS_DIGITAL_MEDIA",
  "ADVERTISING",
] as const;

describe("promotion operations schema", () => {
  let db: IsolatedDatabase;
  beforeAll(async () => {
    db = await createIsolatedDatabase();
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("reports the clean migrated schema as current", () => {
    const output = execSync("pnpm exec prisma migrate status", {
      cwd: resolve(import.meta.dirname, ".."),
      env: { ...process.env, DATABASE_URL: db.url },
      encoding: "utf8",
    });
    expect(output).toContain("Database schema is up to date");
  });

  it("keeps the promotion lookup and talent-assignment indexes in the migrated database", async () => {
    const indexes = await db.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = $1 AND tablename IN ('promotion_activities', 'promotion_activity_talents')`,
      [db.schema],
    );
    const byName = new Map(
      indexes.map((index) => [index.indexname, index.indexdef]),
    );
    expect(
      byName.get("promotion_activities_campaign_id_channel_idx"),
    ).toContain("(campaign_id, channel)");
    expect(
      byName.get(
        "promotion_activity_talents_campaign_activity_id_talent_id_key",
      ),
    ).toContain("(campaign_activity_id, talent_id)");
    expect(byName.get("promotion_activity_talents_talent_id_idx")).toContain(
      "(talent_id)",
    );
  });

  async function campaign(
    type = "PROMOTION",
    columns: Record<string, unknown> = {},
  ) {
    const [workspace] = await db.query<{ id: string }>(
      "INSERT INTO workspaces (kind) VALUES ('CAMPAIGN') RETURNING id",
    );
    const [row] = await db.query<{ id: string; workspace_id: string }>(
      `INSERT INTO campaigns (workspace_id, name, campaign_type, budget_amount, budget_currency, product_name)
       VALUES ($1, 'Awareness launch', $2, $3, $4, $5) RETURNING id, workspace_id`,
      [
        workspace!.id,
        type,
        columns.budgetAmount ?? null,
        columns.budgetCurrency ?? null,
        columns.productName ?? null,
      ],
    );
    return row!;
  }

  async function activity(campaignId: string) {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO campaign_activities (campaign_id, name, start_at, end_at)
       VALUES ($1, 'Broadcast spot', '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z') RETURNING id`,
      [campaignId],
    );
    return row!.id;
  }

  async function promote(
    activityId: string,
    campaignId: string,
    channel = "RADIO_PROMOTION",
  ) {
    return db.query<{
      campaign_activity_id: string;
      campaign_id: string;
      channel: string;
    }>(
      `INSERT INTO promotion_activities (campaign_activity_id, campaign_id, channel)
       VALUES ($1, $2, $3) RETURNING campaign_activity_id, campaign_id, channel`,
      [activityId, campaignId, channel],
    );
  }

  it("links every approved channel to real promotion campaign activities and their workspace", async () => {
    const owner = await campaign("PROMOTION", {
      budgetAmount: "1250.00",
      budgetCurrency: "ETB",
      productName: "New album",
    });
    for (const channel of CHANNELS) {
      const id = await activity(owner.id);
      await expect(promote(id, owner.id, channel)).resolves.toEqual([
        { campaign_activity_id: id, campaign_id: owner.id, channel },
      ]);
    }
    const rows = await db.query<{
      channel: string;
      kind: string;
      product_name: string;
      budget_amount: string;
      budget_currency: string;
      status: string;
    }>(
      `SELECT p.channel, w.kind, c.product_name, c.budget_amount,
              c.budget_currency, a.status
         FROM promotion_activities p
         JOIN campaign_activities a ON a.id = p.campaign_activity_id
         JOIN campaigns c ON c.id = p.campaign_id
         JOIN workspaces w ON w.id = c.workspace_id
        WHERE p.campaign_id = $1`,
      [owner.id],
    );
    expect(rows).toHaveLength(CHANNELS.length);
    expect(
      rows.every(
        (row) =>
          row.kind === "CAMPAIGN" &&
          row.status === "PLANNED" &&
          row.product_name === "New album" &&
          row.budget_amount === "1250.00" &&
          row.budget_currency === "ETB",
      ),
    ).toBe(true);
  });

  it("rejects marketing ownership, mismatched campaigns, duplicate details, and unknown channels", async () => {
    const promotion = await campaign();
    const marketing = await campaign("MARKETING");
    const promotionActivity = await activity(promotion.id);
    const marketingActivity = await activity(marketing.id);

    await expect(
      promote(marketingActivity, marketing.id),
    ).rejects.toMatchObject({
      code: PG_ERROR.foreignKeyViolation,
    });
    await expect(
      promote(promotionActivity, marketing.id),
    ).rejects.toMatchObject({
      code: PG_ERROR.foreignKeyViolation,
    });
    await expect(
      promote(promotionActivity, promotion.id, "BILLBOARD"),
    ).rejects.toMatchObject({
      code: PG_ERROR.invalidTextRepresentation,
    });
    await promote(promotionActivity, promotion.id);
    await expect(
      promote(promotionActivity, promotion.id),
    ).rejects.toMatchObject({
      code: PG_ERROR.uniqueViolation,
    });
    await expect(
      db.query(
        "UPDATE promotion_activities SET campaign_type = 'MARKETING' WHERE campaign_activity_id = $1",
        [promotionActivity],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await expect(
      db.query(
        "UPDATE campaigns SET campaign_type = 'MARKETING' WHERE id = $1",
        [promotion.id],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
  });

  it("enforces explicit talent assignments and cascades them with the activity", async () => {
    const owner = await campaign();
    const id = await activity(owner.id);
    await promote(id, owner.id, "INFLUENCER_MARKETING");
    const [talent] = await db.query<{ id: string }>(
      "INSERT INTO talents (full_name, type) VALUES ('Artist', 'ARTIST') RETURNING id",
    );
    const assign = (talentId: string, role = "Presenter") =>
      db.query(
        `INSERT INTO promotion_activity_talents (campaign_activity_id, talent_id, role)
         VALUES ($1, $2, $3) RETURNING id`,
        [id, talentId, role],
      );
    await expect(assign(talent!.id)).resolves.toHaveLength(1);
    await expect(assign(talent!.id)).rejects.toMatchObject({
      code: PG_ERROR.uniqueViolation,
    });
    await expect(
      assign("00000000-0000-0000-0000-000000000000"),
    ).rejects.toMatchObject({
      code: PG_ERROR.foreignKeyViolation,
    });
    await expect(
      db.query(
        "UPDATE promotion_activity_talents SET role = '  ' WHERE campaign_activity_id = $1",
        [id],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await db.query("DELETE FROM campaign_activities WHERE id = $1", [id]);
    expect(
      await db.query(
        "SELECT id FROM promotion_activity_talents WHERE talent_id = $1",
        [talent!.id],
      ),
    ).toHaveLength(0);
    expect(
      await db.query("SELECT id FROM talents WHERE id = $1", [talent!.id]),
    ).toHaveLength(1);
    const second = await activity(owner.id);
    await promote(second, owner.id);
    await db.query(
      "INSERT INTO promotion_activity_talents (campaign_activity_id, talent_id, role) VALUES ($1, $2, 'Presenter')",
      [second, talent!.id],
    );
    await db.query("DELETE FROM campaigns WHERE id = $1", [owner.id]);
    expect(
      await db.query(
        "SELECT campaign_activity_id FROM promotion_activities WHERE campaign_id = $1",
        [owner.id],
      ),
    ).toHaveLength(0);
    expect(
      await db.query(
        "SELECT id FROM promotion_activity_talents WHERE talent_id = $1",
        [talent!.id],
      ),
    ).toHaveLength(0);
    expect(
      await db.query("SELECT id FROM talents WHERE id = $1", [talent!.id]),
    ).toHaveLength(1);
  });

  it("retains shared money and related-subject invariants for promotion campaigns", async () => {
    const owner = await campaign();
    const id = await activity(owner.id);
    await expect(
      db.query(
        "UPDATE campaign_activities SET end_at = '2026-09-30T00:00:00Z' WHERE id = $1",
        [id],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await expect(
      db.query(
        "UPDATE campaign_activities SET status = 'UNKNOWN' WHERE id = $1",
        [id],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.invalidTextRepresentation });
    await expect(
      db.query(
        "UPDATE campaigns SET budget_amount = -1, budget_currency = 'ETB' WHERE id = $1",
        [owner.id],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await expect(
      db.query(
        "UPDATE campaigns SET budget_amount = 10, budget_currency = NULL WHERE id = $1",
        [owner.id],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    const [eventWorkspace] = await db.query<{ id: string }>(
      "INSERT INTO workspaces (kind) VALUES ('EVENT') RETURNING id",
    );
    const [event] = await db.query<{ id: string }>(
      "INSERT INTO events (workspace_id, name, event_type) VALUES ($1, 'Concert', 'CONCERT') RETURNING id",
      [eventWorkspace!.id],
    );
    await expect(
      db.query(
        "UPDATE campaigns SET event_id = $1, product_name = 'Album' WHERE id = $2",
        [event!.id, owner.id],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
  });
});
