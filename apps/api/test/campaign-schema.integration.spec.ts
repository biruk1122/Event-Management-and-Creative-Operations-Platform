import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

interface CampaignRow {
  id: string;
  workspace_id: string;
  name: string;
  campaign_type: string;
  description: string | null;
  audience: string | null;
  start_at: Date | null;
  end_at: Date | null;
  status: string;
  event_id: string | null;
  product_name: string | null;
  budget_amount: string | null;
  budget_currency: string | null;
  created_by_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ActivityRow {
  id: string;
  campaign_id: string;
  name: string;
  description: string | null;
  start_at: Date | null;
  end_at: Date | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

describe("campaign platform schema", () => {
  let db: IsolatedDatabase;
  let counter = 0;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
  });

  afterAll(async () => {
    await db?.drop();
  });

  function unique(prefix: string): string {
    counter += 1;
    return `${prefix} ${counter}`;
  }

  async function insertUser(): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ($1) RETURNING id`,
      [`campaign-user-${++counter}@example.test`],
    );
    return row!.id;
  }

  async function insertWorkspace(kind = "CAMPAIGN"): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO workspaces (kind) VALUES ($1) RETURNING id`,
      [kind],
    );
    return row!.id;
  }

  async function insertEvent(): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO events (workspace_id, name, event_type)
       VALUES ($1, $2, 'CONCERT') RETURNING id`,
      [await insertWorkspace("EVENT"), unique("Campaign event")],
    );
    return row!.id;
  }

  async function insertCampaign(
    columns: Record<string, unknown> = {},
  ): Promise<CampaignRow> {
    const base: Record<string, unknown> = {
      workspace_id: await insertWorkspace(),
      name: unique("Campaign"),
      campaign_type: "MARKETING",
      ...columns,
    };
    const keys = Object.keys(base);
    const values = Object.values(base);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<CampaignRow & Record<string, unknown>>(
      `INSERT INTO campaigns (${keys.join(", ")})
       VALUES (${placeholders}) RETURNING *`,
      values,
    );
    return row!;
  }

  async function insertActivity(
    campaignId: string,
    columns: Record<string, unknown> = {},
  ): Promise<ActivityRow> {
    const base: Record<string, unknown> = {
      campaign_id: campaignId,
      name: unique("Activity"),
      ...columns,
    };
    const keys = Object.keys(base);
    const values = Object.values(base);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<ActivityRow & Record<string, unknown>>(
      `INSERT INTO campaign_activities (${keys.join(", ")})
       VALUES (${placeholders}) RETURNING *`,
      values,
    );
    return row!;
  }

  it("creates a campaign with server defaults", async () => {
    const row = await insertCampaign();

    expect(row.id).toEqual(expect.any(String));
    expect(row.campaign_type).toBe("MARKETING");
    expect(row.status).toBe("PLANNED");
    expect(row.description).toBeNull();
    expect(row.audience).toBeNull();
    expect(row.start_at).toBeNull();
    expect(row.end_at).toBeNull();
    expect(row.event_id).toBeNull();
    expect(row.product_name).toBeNull();
    expect(row.budget_amount).toBeNull();
    expect(row.budget_currency).toBeNull();
    expect(row.created_by_id).toBeNull();
    expect(row.created_at).toBeInstanceOf(Date);
    expect(row.updated_at).toBeInstanceOf(Date);
  });

  it("round-trips a fully populated campaign", async () => {
    const creator = await insertUser();
    const eventId = await insertEvent();
    const row = await insertCampaign({
      name: "Autumn Launch",
      campaign_type: "PROMOTION",
      description: "Launch awareness push.",
      audience: "Young adults in urban areas",
      start_at: "2026-10-01T00:00:00.000Z",
      end_at: "2026-11-01T00:00:00.000Z",
      status: "ACTIVE",
      event_id: eventId,
      budget_amount: "25000.50",
      budget_currency: "ETB",
      created_by_id: creator,
    });

    expect(row).toMatchObject({
      name: "Autumn Launch",
      campaign_type: "PROMOTION",
      description: "Launch awareness push.",
      audience: "Young adults in urban areas",
      status: "ACTIVE",
      event_id: eventId,
      budget_amount: "25000.50",
      budget_currency: "ETB",
      created_by_id: creator,
    });
    expect(row.start_at).toBeInstanceOf(Date);
    expect(row.end_at).toBeInstanceOf(Date);
  });

  describe("connected workspace link", () => {
    it("requires a workspace id", async () => {
      await expect(
        db.query(
          `INSERT INTO campaigns (name, campaign_type)
           VALUES ($1, 'MARKETING')`,
          [unique("Campaign")],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.notNullViolation });
    });

    it("rejects a workspace id that is not a real workspace", async () => {
      await expect(
        insertCampaign({ workspace_id: MISSING_UUID }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });

    it("allows only one campaign per workspace", async () => {
      const workspaceId = await insertWorkspace();
      await insertCampaign({ workspace_id: workspaceId });

      await expect(
        insertCampaign({ workspace_id: workspaceId }),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });

    it("blocks deleting a workspace a campaign still owns", async () => {
      const row = await insertCampaign();

      await expect(
        db.query(`DELETE FROM workspaces WHERE id = $1`, [row.workspace_id]),
      ).rejects.toMatchObject({ code: PG_ERROR.restrictViolation });
    });
  });

  describe("type and lifecycle", () => {
    it("accepts every campaign type and rejects an unknown one", async () => {
      for (const campaignType of ["MARKETING", "PROMOTION"]) {
        await expect(
          insertCampaign({ campaign_type: campaignType }),
        ).resolves.toMatchObject({ campaign_type: campaignType });
      }
      await expect(
        insertCampaign({ campaign_type: "ADVERTISING" }),
      ).rejects.toMatchObject({ code: PG_ERROR.invalidTextRepresentation });
    });

    it("requires a campaign type", async () => {
      await expect(
        db.query(`INSERT INTO campaigns (workspace_id, name) VALUES ($1, $2)`, [
          await insertWorkspace(),
          unique("Campaign"),
        ]),
      ).rejects.toMatchObject({ code: PG_ERROR.notNullViolation });
    });

    it("accepts every status and rejects an unknown one", async () => {
      for (const status of ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"]) {
        await expect(insertCampaign({ status })).resolves.toMatchObject({
          status,
        });
      }
      await expect(insertCampaign({ status: "ON_HOLD" })).rejects.toMatchObject(
        { code: PG_ERROR.invalidTextRepresentation },
      );
    });
  });

  describe("text fields", () => {
    it("rejects a blank or whitespace-only name", async () => {
      for (const name of ["", "   "]) {
        await expect(insertCampaign({ name })).rejects.toMatchObject({
          code: PG_ERROR.checkViolation,
        });
      }
    });

    it.each(["description", "audience", "product_name"])(
      "rejects a blank %s but allows it to be unset",
      async (column) => {
        await expect(insertCampaign({ [column]: "  " })).rejects.toMatchObject({
          code: PG_ERROR.checkViolation,
        });
        await expect(insertCampaign({ [column]: null })).resolves.toMatchObject(
          { [column]: null },
        );
      },
    );
  });

  describe("schedule", () => {
    it("allows an unscheduled, half-scheduled, or ordered campaign", async () => {
      await expect(insertCampaign()).resolves.toBeDefined();
      await expect(
        insertCampaign({ start_at: "2026-10-01T00:00:00.000Z" }),
      ).resolves.toBeDefined();
      await expect(
        insertCampaign({ end_at: "2026-10-01T00:00:00.000Z" }),
      ).resolves.toBeDefined();
      await expect(
        insertCampaign({
          start_at: "2026-10-01T00:00:00.000Z",
          end_at: "2026-10-01T00:00:00.000Z",
        }),
      ).resolves.toBeDefined();
    });

    it("rejects an end before the start", async () => {
      await expect(
        insertCampaign({
          start_at: "2026-10-02T00:00:00.000Z",
          end_at: "2026-10-01T00:00:00.000Z",
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("stores timestamps in UTC", async () => {
      const row = await insertCampaign({
        start_at: "2026-10-01T03:00:00+03:00",
      });

      expect(row.start_at?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    });
  });

  describe("budget", () => {
    it("stores numeric money exactly with its currency", async () => {
      const row = await insertCampaign({
        budget_amount: "0.10",
        budget_currency: "USD",
      });

      expect(row.budget_amount).toBe("0.10");
      expect(row.budget_currency).toBe("USD");
    });

    it("allows a zero budget", async () => {
      await expect(
        insertCampaign({ budget_amount: "0", budget_currency: "USD" }),
      ).resolves.toMatchObject({ budget_amount: "0.00" });
    });

    it("rejects an amount without a currency and the reverse", async () => {
      await expect(
        insertCampaign({ budget_amount: "10" }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        insertCampaign({ budget_currency: "USD" }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("rejects a negative amount", async () => {
      await expect(
        insertCampaign({ budget_amount: "-1", budget_currency: "USD" }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("rejects a currency that is not three upper-case letters", async () => {
      for (const currency of ["usd", "US1", "U$D"]) {
        await expect(
          insertCampaign({ budget_amount: "1", budget_currency: currency }),
        ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      }
    });
  });

  describe("related subject", () => {
    it("allows an event subject, a product subject, or none", async () => {
      const eventId = await insertEvent();

      await expect(
        insertCampaign({ event_id: eventId }),
      ).resolves.toMatchObject({ event_id: eventId, product_name: null });
      await expect(
        insertCampaign({ product_name: "Nexo Energy Drink" }),
      ).resolves.toMatchObject({
        event_id: null,
        product_name: "Nexo Energy Drink",
      });
      await expect(insertCampaign()).resolves.toMatchObject({
        event_id: null,
        product_name: null,
      });
    });

    it("rejects both an event and a product subject", async () => {
      await expect(
        insertCampaign({
          event_id: await insertEvent(),
          product_name: "Nexo Energy Drink",
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("rejects an event that does not exist", async () => {
      await expect(
        insertCampaign({ event_id: MISSING_UUID }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });

    it("clears the event reference when the event is deleted", async () => {
      const eventId = await insertEvent();
      const row = await insertCampaign({ event_id: eventId });

      await db.query(`DELETE FROM events WHERE id = $1`, [eventId]);

      const [after] = await db.query<CampaignRow & Record<string, unknown>>(
        `SELECT * FROM campaigns WHERE id = $1`,
        [row.id],
      );
      expect(after?.event_id).toBeNull();
    });
  });

  describe("author", () => {
    it("rejects an author that does not exist", async () => {
      await expect(
        insertCampaign({ created_by_id: MISSING_UUID }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });

    it("clears the author when the user is deleted", async () => {
      const userId = await insertUser();
      const row = await insertCampaign({ created_by_id: userId });

      await db.query(`DELETE FROM users WHERE id = $1`, [userId]);

      const [after] = await db.query<CampaignRow & Record<string, unknown>>(
        `SELECT * FROM campaigns WHERE id = $1`,
        [row.id],
      );
      expect(after?.created_by_id).toBeNull();
    });
  });

  describe("activities", () => {
    it("creates an activity with server defaults", async () => {
      const campaign = await insertCampaign();
      const row = await insertActivity(campaign.id);

      expect(row.id).toEqual(expect.any(String));
      expect(row.status).toBe("PLANNED");
      expect(row.description).toBeNull();
      expect(row.start_at).toBeNull();
      expect(row.end_at).toBeNull();
      expect(row.created_at).toBeInstanceOf(Date);
      expect(row.updated_at).toBeInstanceOf(Date);
    });

    it("requires an existing campaign", async () => {
      await expect(
        db.query(`INSERT INTO campaign_activities (name) VALUES ($1)`, [
          unique("Activity"),
        ]),
      ).rejects.toMatchObject({ code: PG_ERROR.notNullViolation });
      await expect(insertActivity(MISSING_UUID)).rejects.toMatchObject({
        code: PG_ERROR.foreignKeyViolation,
      });
    });

    it("allows several activities per campaign, including equal names", async () => {
      const campaign = await insertCampaign();

      await insertActivity(campaign.id, { name: "Teaser" });
      await expect(
        insertActivity(campaign.id, { name: "Teaser" }),
      ).resolves.toBeDefined();
    });

    it("accepts every status and rejects an unknown one", async () => {
      const campaign = await insertCampaign();

      for (const status of [
        "PLANNED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
      ]) {
        await expect(
          insertActivity(campaign.id, { status }),
        ).resolves.toMatchObject({ status });
      }
      await expect(
        insertActivity(campaign.id, { status: "ACTIVE" }),
      ).rejects.toMatchObject({ code: PG_ERROR.invalidTextRepresentation });
    });

    it("rejects a blank name and a blank description", async () => {
      const campaign = await insertCampaign();

      for (const name of ["", "  "]) {
        await expect(
          insertActivity(campaign.id, { name }),
        ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      }
      await expect(
        insertActivity(campaign.id, { description: " " }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("rejects an end before the start", async () => {
      const campaign = await insertCampaign();

      await expect(
        insertActivity(campaign.id, {
          start_at: "2026-10-02T00:00:00.000Z",
          end_at: "2026-10-01T00:00:00.000Z",
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("is deleted with its campaign", async () => {
      const campaign = await insertCampaign();
      await insertActivity(campaign.id);
      await insertActivity(campaign.id);

      await db.query(`DELETE FROM campaigns WHERE id = $1`, [campaign.id]);

      const remaining = await db.query(
        `SELECT 1 FROM campaign_activities WHERE campaign_id = $1`,
        [campaign.id],
      );
      expect(remaining).toHaveLength(0);
    });
  });

  describe("access-pattern indexes", () => {
    it("indexes the documented campaign and activity filters", async () => {
      const indexes = await db.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
         WHERE tablename IN ('campaigns', 'campaign_activities')
           AND schemaname = current_schema()`,
      );

      expect(indexes.map((index) => index.indexname)).toEqual(
        expect.arrayContaining([
          "campaigns_workspace_id_key",
          "campaigns_campaign_type_status_idx",
          "campaigns_status_idx",
          "campaigns_event_id_idx",
          "campaigns_start_at_idx",
          "campaigns_created_by_id_idx",
          "campaign_activities_campaign_id_status_idx",
          "campaign_activities_campaign_id_start_at_idx",
        ]),
      );
    });
  });
});
