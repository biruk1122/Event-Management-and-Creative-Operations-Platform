import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

interface EventRow {
  id: string;
  workspace_id: string;
  name: string;
  event_type: string;
  description: string | null;
  start_at: Date | null;
  end_at: Date | null;
  location: string | null;
  organizer_name: string | null;
  status: string;
  budget_amount: string | null;
  budget_currency: string | null;
  created_by_id: string | null;
  created_at: Date;
  updated_at: Date;
}

describe("event management schema", () => {
  let db: IsolatedDatabase;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
  });

  afterAll(async () => {
    await db?.drop();
  });

  let counter = 0;
  function unique(prefix: string): string {
    counter += 1;
    return `${prefix} ${counter}`;
  }

  async function insertUser(
    email = `${unique("user").replace(" ", "")}@event.test`,
  ): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ($1) RETURNING id`,
      [email],
    );
    return row!.id;
  }

  async function insertWorkspace(kind = "EVENT"): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO workspaces (kind) VALUES ($1) RETURNING id`,
      [kind],
    );
    return row!.id;
  }

  async function insertEvent(
    columns: Record<string, unknown> = {},
  ): Promise<EventRow> {
    const base: Record<string, unknown> = {
      workspace_id: await insertWorkspace(),
      name: unique("Event"),
      event_type: "CONCERT",
      ...columns,
    };
    const keys = Object.keys(base);
    const values = Object.values(base);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<EventRow & Record<string, unknown>>(
      `INSERT INTO events (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
    return row!;
  }

  it("creates an event with server defaults", async () => {
    const row = await insertEvent();

    expect(row.id).toEqual(expect.any(String));
    expect(row.event_type).toBe("CONCERT");
    expect(row.status).toBe("PLANNING");
    expect(row.description).toBeNull();
    expect(row.start_at).toBeNull();
    expect(row.end_at).toBeNull();
    expect(row.location).toBeNull();
    expect(row.organizer_name).toBeNull();
    expect(row.budget_amount).toBeNull();
    expect(row.budget_currency).toBeNull();
    expect(row.created_by_id).toBeNull();
    expect(row.created_at).toBeInstanceOf(Date);
    expect(row.updated_at).toBeInstanceOf(Date);
  });

  it("round-trips a fully populated event", async () => {
    const creator = await insertUser("creator@event.test");
    const row = await insertEvent({
      name: "Autumn Concert",
      event_type: "FILM_PREMIERE",
      description: "Opening night.",
      start_at: "2026-10-01T18:00:00.000Z",
      end_at: "2026-10-01T22:00:00.000Z",
      location: "Grand Hall",
      organizer_name: "City Arts Council",
      status: "READY",
      budget_amount: "15000.50",
      budget_currency: "USD",
      created_by_id: creator,
    });

    expect(row).toMatchObject({
      name: "Autumn Concert",
      event_type: "FILM_PREMIERE",
      description: "Opening night.",
      location: "Grand Hall",
      organizer_name: "City Arts Council",
      status: "READY",
      budget_amount: "15000.50",
      budget_currency: "USD",
      created_by_id: creator,
    });
    expect(row.start_at).toBeInstanceOf(Date);
    expect(row.end_at).toBeInstanceOf(Date);
  });

  describe("connected workspace link", () => {
    it("requires a workspace id", async () => {
      await expect(
        db.query(
          `INSERT INTO events (name, event_type) VALUES ($1, 'CONCERT')`,
          [unique("Event")],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.notNullViolation });
    });

    it("rejects a workspace id that is not a real workspace", async () => {
      await expect(
        insertEvent({ workspace_id: MISSING_UUID }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });

    it("allows only one event per workspace", async () => {
      const workspaceId = await insertWorkspace();
      await insertEvent({ workspace_id: workspaceId });

      await expect(
        insertEvent({ workspace_id: workspaceId }),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });

    it("refuses to delete a workspace that an event still owns", async () => {
      const event = await insertEvent();

      // `ON DELETE RESTRICT` raises its own SQLSTATE, distinct from the plain
      // foreign-key-violation code used for a bad reference on insert.
      await expect(
        db.query(`DELETE FROM workspaces WHERE id = $1`, [event.workspace_id]),
      ).rejects.toMatchObject({ code: PG_ERROR.restrictViolation });

      const [survivor] = await db.query<{ id: string }>(
        `SELECT id FROM events WHERE id = $1`,
        [event.id],
      );
      expect(survivor?.id).toBe(event.id);
    });
  });

  describe("type and status enums", () => {
    it("accepts every event type", async () => {
      for (const eventType of [
        "FILM_PREMIERE",
        "CONCERT",
        "ALBUM_RELEASE",
        "PRODUCT_LAUNCH",
        "CORPORATE_EVENT",
        "PROMOTIONAL_EVENT",
        "OTHER",
      ]) {
        await expect(
          insertEvent({ event_type: eventType }),
        ).resolves.toMatchObject({ event_type: eventType });
      }
    });

    it("rejects a type outside the enum and requires one", async () => {
      await expect(insertEvent({ event_type: "GALA" })).rejects.toMatchObject({
        code: PG_ERROR.invalidTextRepresentation,
      });
      await expect(
        db.query(`INSERT INTO events (workspace_id, name) VALUES ($1, $2)`, [
          await insertWorkspace(),
          unique("Event"),
        ]),
      ).rejects.toMatchObject({ code: PG_ERROR.notNullViolation });
    });

    it("accepts every lifecycle state and rejects an unknown one", async () => {
      for (const status of [
        "PLANNING",
        "READY",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
      ]) {
        await expect(insertEvent({ status })).resolves.toMatchObject({
          status,
        });
      }
      await expect(insertEvent({ status: "ARCHIVED" })).rejects.toMatchObject({
        code: PG_ERROR.invalidTextRepresentation,
      });
    });
  });

  describe("text invariants", () => {
    it("rejects a blank or whitespace-only name", async () => {
      await expect(insertEvent({ name: "" })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
      await expect(insertEvent({ name: "   " })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
    });

    it.each(["description", "location", "organizer_name"])(
      "rejects a blank %s but allows null",
      async (column) => {
        await expect(insertEvent({ [column]: "  " })).rejects.toMatchObject({
          code: PG_ERROR.checkViolation,
        });
        await expect(insertEvent({ [column]: null })).resolves.toMatchObject({
          [column]: null,
        });
      },
    );
  });

  describe("schedule ordering", () => {
    it("allows an end at or after the start, and either end open", async () => {
      await expect(
        insertEvent({
          start_at: "2026-01-01T10:00:00.000Z",
          end_at: "2026-01-01T10:00:00.000Z",
        }),
      ).resolves.toBeTruthy();
      await expect(
        insertEvent({ start_at: "2026-01-01T10:00:00.000Z", end_at: null }),
      ).resolves.toBeTruthy();
      await expect(
        insertEvent({ start_at: null, end_at: "2026-01-01T10:00:00.000Z" }),
      ).resolves.toBeTruthy();
    });

    it("rejects an end before the start", async () => {
      await expect(
        insertEvent({
          start_at: "2026-01-02T10:00:00.000Z",
          end_at: "2026-01-01T10:00:00.000Z",
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });
  });

  describe("budget invariants", () => {
    it("accepts a matched amount and currency", async () => {
      await expect(
        insertEvent({ budget_amount: "0", budget_currency: "EUR" }),
      ).resolves.toMatchObject({ budget_currency: "EUR" });
    });

    it("rejects an amount without a currency and a currency without an amount", async () => {
      await expect(insertEvent({ budget_amount: "100" })).rejects.toMatchObject(
        { code: PG_ERROR.checkViolation },
      );
      await expect(
        insertEvent({ budget_currency: "USD" }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("rejects a negative amount and a malformed currency code", async () => {
      await expect(
        insertEvent({ budget_amount: "-1", budget_currency: "USD" }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        insertEvent({ budget_amount: "10", budget_currency: "usd" }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        insertEvent({ budget_amount: "10", budget_currency: "US" }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });
  });

  describe("creator link", () => {
    it("rejects a creator id that is not a real user", async () => {
      await expect(
        insertEvent({ created_by_id: MISSING_UUID }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });

    it("clears the creator when that user is removed", async () => {
      const creator = await insertUser("leaving.author@event.test");
      const event = await insertEvent({ created_by_id: creator });

      await db.query(`DELETE FROM users WHERE id = $1`, [creator]);

      const [row] = await db.query<{ created_by_id: string | null }>(
        `SELECT created_by_id FROM events WHERE id = $1`,
        [event.id],
      );
      expect(row?.created_by_id).toBeNull();
    });
  });

  it("reports every committed migration as applied", async () => {
    const [row] = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    expect(Number(row!.count)).toBeGreaterThanOrEqual(9);
  });
});
