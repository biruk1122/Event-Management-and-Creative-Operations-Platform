import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

const LIFECYCLE_MIGRATION = resolve(
  import.meta.dirname,
  "..",
  "prisma/migrations/20261103120000_talent_assignment_lifecycle/migration.sql",
);

describe("talent assignment lifecycle schema", () => {
  let db: IsolatedDatabase;
  let counter = 0;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
  });

  afterAll(async () => {
    await db?.drop();
  });

  function label(prefix: string): string {
    counter += 1;
    return `${prefix} ${counter}`;
  }

  async function insertTalent(): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO talents (full_name, type) VALUES ($1, 'ARTIST') RETURNING id`,
      [label("Talent")],
    );
    return row!.id;
  }

  async function insertUser(): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ($1) RETURNING id`,
      [`lifecycle-${++counter}@example.test`],
    );
    return row!.id;
  }

  async function insertEvent(): Promise<string> {
    const [workspace] = await db.query<{ id: string }>(
      `INSERT INTO workspaces (kind) VALUES ('EVENT') RETURNING id`,
    );
    const [event] = await db.query<{ id: string }>(
      `INSERT INTO events (workspace_id, name, event_type)
       VALUES ($1, $2, 'CONCERT') RETURNING id`,
      [workspace!.id, label("Event")],
    );
    return event!.id;
  }

  async function insertProduction(): Promise<string> {
    const [workspace] = await db.query<{ id: string }>(
      `INSERT INTO workspaces (kind) VALUES ('PRODUCTION') RETURNING id`,
    );
    const [production] = await db.query<{ id: string }>(
      `INSERT INTO productions (workspace_id, name, production_type)
       VALUES ($1, $2, 'STAGE') RETURNING id`,
      [workspace!.id, label("Production")],
    );
    return production!.id;
  }

  async function insertEventAssignment(
    eventId: string,
    talentId: string,
    columns: Record<string, unknown> = {},
  ): Promise<string> {
    const values: Record<string, unknown> = {
      event_id: eventId,
      talent_id: talentId,
      role: "Headliner",
      ...columns,
    };
    const keys = Object.keys(values);
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO event_talents (${keys.join(", ")})
       VALUES (${keys.map((_, index) => `$${index + 1}`).join(", ")})
       RETURNING id`,
      Object.values(values),
    );
    return row!.id;
  }

  describe("one active assignment per talent and event", () => {
    it("rejects a second ASSIGNED row for the same talent and event", async () => {
      const eventId = await insertEvent();
      const talentId = await insertTalent();
      await insertEventAssignment(eventId, talentId);
      await expect(
        insertEventAssignment(eventId, talentId),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });

    it("allows a new assignment after the previous one was cancelled, keeping both rows", async () => {
      const eventId = await insertEvent();
      const talentId = await insertTalent();
      const first = await insertEventAssignment(eventId, talentId);
      await db.query(
        `UPDATE event_talents
            SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'Withdrew'
          WHERE id = $1`,
        [first],
      );
      const second = await insertEventAssignment(eventId, talentId);

      const rows = await db.query<{
        id: string;
        status: string;
        active_slot: number | null;
      }>(
        `SELECT id, status, active_slot FROM event_talents
          WHERE event_id = $1 AND talent_id = $2 ORDER BY assigned_at`,
        [eventId, talentId],
      );
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.id === first)).toMatchObject({
        status: "CANCELLED",
        active_slot: null,
      });
      expect(rows.find((row) => row.id === second)).toMatchObject({
        status: "ASSIGNED",
        active_slot: 1,
      });
    });

    it("keeps unlimited cancelled and completed history for the same pair", async () => {
      const eventId = await insertEvent();
      const talentId = await insertTalent();
      for (let round = 0; round < 3; round += 1) {
        const id = await insertEventAssignment(eventId, talentId);
        await db.query(
          `UPDATE event_talents SET status = 'COMPLETED', completed_at = now() WHERE id = $1`,
          [id],
        );
      }
      const [count] = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM event_talents WHERE event_id = $1 AND talent_id = $2`,
        [eventId, talentId],
      );
      expect(count!.n).toBe(3);
    });
  });

  describe("lifecycle trigger", () => {
    it("derives active_slot from status when a row is inserted as ASSIGNED", async () => {
      const eventId = await insertEvent();
      const talentId = await insertTalent();
      const id = await insertEventAssignment(eventId, talentId);
      const [row] = await db.query<{ active_slot: number | null }>(
        `SELECT active_slot FROM event_talents WHERE id = $1`,
        [id],
      );
      expect(row!.active_slot).toBe(1);
    });

    it("clears active_slot when an assignment is cancelled", async () => {
      const eventId = await insertEvent();
      const talentId = await insertTalent();
      const id = await insertEventAssignment(eventId, talentId);
      await db.query(
        `UPDATE event_talents SET status = 'CANCELLED', cancelled_at = now() WHERE id = $1`,
        [id],
      );
      const [row] = await db.query<{ active_slot: number | null }>(
        `SELECT active_slot FROM event_talents WHERE id = $1`,
        [id],
      );
      expect(row!.active_slot).toBeNull();
    });

    it("never reactivates a cancelled assignment", async () => {
      const eventId = await insertEvent();
      const talentId = await insertTalent();
      const id = await insertEventAssignment(eventId, talentId);
      await db.query(
        `UPDATE event_talents SET status = 'CANCELLED', cancelled_at = now() WHERE id = $1`,
        [id],
      );
      await expect(
        db.query(
          `UPDATE event_talents SET status = 'ASSIGNED', cancelled_at = NULL WHERE id = $1`,
          [id],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("never changes a completed assignment's details", async () => {
      const eventId = await insertEvent();
      const talentId = await insertTalent();
      const id = await insertEventAssignment(eventId, talentId, {
        notes: "Original",
      });
      await db.query(
        `UPDATE event_talents SET status = 'COMPLETED', completed_at = now() WHERE id = $1`,
        [id],
      );
      await expect(
        db.query(`UPDATE event_talents SET notes = 'Rewritten' WHERE id = $1`, [
          id,
        ]),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });
  });

  describe("status and schedule checks", () => {
    it("requires cancelled_at when a row is CANCELLED", async () => {
      const eventId = await insertEvent();
      const talentId = await insertTalent();
      await expect(
        insertEventAssignment(eventId, talentId, { status: "CANCELLED" }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("rejects an assignment that ends before it starts", async () => {
      const eventId = await insertEvent();
      const talentId = await insertTalent();
      await expect(
        insertEventAssignment(eventId, talentId, {
          start_at: "2026-11-10T10:00:00Z",
          end_at: "2026-11-09T10:00:00Z",
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("applies the same one-active rule to production assignments", async () => {
      const productionId = await insertProduction();
      const talentId = await insertTalent();
      await db.query(
        `INSERT INTO production_talents (production_id, talent_id, role) VALUES ($1, $2, 'Host')`,
        [productionId, talentId],
      );
      await expect(
        db.query(
          `INSERT INTO production_talents (production_id, talent_id, role) VALUES ($1, $2, 'Host')`,
          [productionId, talentId],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });
  });

  describe("append-only talent history", () => {
    it("accepts new history rows and rejects any update to them", async () => {
      const talentId = await insertTalent();
      const actorId = await insertUser();
      const [row] = await db.query<{ id: string }>(
        `INSERT INTO talent_activities (talent_id, type, actor_id, details)
         VALUES ($1, 'CREATED', $2, '{"fullName":"Created"}') RETURNING id`,
        [talentId, actorId],
      );
      await expect(
        db.query(`UPDATE talent_activities SET details = '{}' WHERE id = $1`, [
          row!.id,
        ]),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("records a conflict override and rejects edits to it", async () => {
      const talentId = await insertTalent();
      const eventId = await insertEvent();
      const assignmentId = await insertEventAssignment(eventId, talentId);
      const authorizerId = await insertUser();
      const [row] = await db.query<{ id: string }>(
        `INSERT INTO talent_conflict_overrides
           (talent_id, assignment_kind, assignment_id, authorized_by_id, reason, conflicts)
         VALUES ($1, 'EVENT', $2, $3, 'Headliner confirmed', '[{"kind":"UNAVAILABLE"}]')
         RETURNING id`,
        [talentId, assignmentId, authorizerId],
      );
      await expect(
        db.query(
          `UPDATE talent_conflict_overrides SET reason = 'Changed' WHERE id = $1`,
          [row!.id],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });
  });

  describe("history survives talent deletion", () => {
    it("refuses to delete a talent that has an assignment, keeping the assignment", async () => {
      const eventId = await insertEvent();
      const talentId = await insertTalent();
      const assignmentId = await insertEventAssignment(eventId, talentId);
      await expect(
        db.query(`DELETE FROM talents WHERE id = $1`, [talentId]),
      ).rejects.toMatchObject({ code: PG_ERROR.restrictViolation });
      const [row] = await db.query<{ id: string }>(
        `SELECT id FROM event_talents WHERE id = $1`,
        [assignmentId],
      );
      expect(row!.id).toBe(assignmentId);
    });

    it("refuses to delete a talent that has promotional or production assignments", async () => {
      const productionId = await insertProduction();
      const talentId = await insertTalent();
      await db.query(
        `INSERT INTO production_talents (production_id, talent_id, role) VALUES ($1, $2, 'Host')`,
        [productionId, talentId],
      );
      await expect(
        db.query(`DELETE FROM talents WHERE id = $1`, [talentId]),
      ).rejects.toMatchObject({ code: PG_ERROR.restrictViolation });
    });

    it("refuses to delete a talent that has history or conflict overrides", async () => {
      const talentId = await insertTalent();
      await db.query(
        `INSERT INTO talent_activities (talent_id, type, details) VALUES ($1, 'CREATED', '{}')`,
        [talentId],
      );
      await expect(
        db.query(`DELETE FROM talents WHERE id = $1`, [talentId]),
      ).rejects.toMatchObject({ code: PG_ERROR.restrictViolation });
    });

    it("refuses to delete a history or override row directly", async () => {
      const talentId = await insertTalent();
      const [row] = await db.query<{ id: string }>(
        `INSERT INTO talent_activities (talent_id, type, details) VALUES ($1, 'CREATED', '{}') RETURNING id`,
        [talentId],
      );
      await expect(
        db.query(`DELETE FROM talent_activities WHERE id = $1`, [row!.id]),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("still deletes a talent that has no history or assignments", async () => {
      const talentId = await insertTalent();
      await db.query(`DELETE FROM talents WHERE id = $1`, [talentId]);
      const [row] = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM talents WHERE id = $1`,
        [talentId],
      );
      expect(row!.n).toBe(0);
    });
  });

  describe("migration pre-flight", () => {
    it("stops with an actionable error and changes nothing when duplicate active rows exist", async () => {
      const eventId = await insertEvent();
      const talentId = await insertTalent();
      await insertEventAssignment(eventId, talentId);
      // Simulate a database without the new key so a duplicate can exist.
      await db.query(
        `DROP INDEX "event_talents_event_id_talent_id_active_slot_key"`,
      );
      await insertEventAssignment(eventId, talentId);

      const migration = readFileSync(LIFECYCLE_MIGRATION, "utf8");
      const preflight = migration.slice(
        migration.indexOf("DO $$"),
        migration.indexOf("END $$;") + "END $$;".length,
      );
      await expect(db.query(preflight)).rejects.toThrow(
        /duplicate active event assignments exist/,
      );

      const [count] = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM event_talents WHERE event_id = $1 AND talent_id = $2`,
        [eventId, talentId],
      );
      expect(count!.n).toBe(2);
    });
  });
});
