import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

interface CalendarEntryRow {
  id: string;
  title: string;
  description: string | null;
  type: string;
  start_at: Date;
  end_at: Date | null;
  user_id: string;
  event_id: string | null;
  task_id: string | null;
  project_id: string | null;
  created_by_id: string | null;
  created_at: Date;
  updated_at: Date;
}

describe("calendar and personal schedules schema", () => {
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
    counter += 1;
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ($1) RETURNING id`,
      [`calendar-${counter}@example.test`],
    );
    return row!.id;
  }

  async function insertWorkspace(kind: "EVENT" | "PROJECT"): Promise<string> {
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
      [await insertWorkspace("EVENT"), unique("Event")],
    );
    return row!.id;
  }

  async function insertTask(): Promise<string> {
    const [department] = await db.query<{ id: string }>(
      `INSERT INTO departments (name) VALUES ($1) RETURNING id`,
      [unique("Department")],
    );
    const [task] = await db.query<{ id: string }>(
      `INSERT INTO tasks (department_id, title) VALUES ($1, $2) RETURNING id`,
      [department!.id, unique("Task")],
    );
    return task!.id;
  }

  async function insertProject(): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO projects (workspace_id, name) VALUES ($1, $2) RETURNING id`,
      [await insertWorkspace("PROJECT"), unique("Project")],
    );
    return row!.id;
  }

  async function insertEntry(
    columns: Record<string, unknown> = {},
  ): Promise<CalendarEntryRow> {
    const base: Record<string, unknown> = {
      title: unique("Calendar entry"),
      type: "PERSONAL",
      start_at: "2026-10-01T09:00:00.000Z",
      user_id: await insertUser(),
      ...columns,
    };
    const keys = Object.keys(base);
    const values = Object.values(base);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<CalendarEntryRow & Record<string, unknown>>(
      `INSERT INTO calendar_entries (${keys.join(", ")})
       VALUES (${placeholders}) RETURNING *`,
      values,
    );
    return row!;
  }

  it("creates calendar-owned personal entries with server defaults", async () => {
    const row = await insertEntry();

    expect(row).toMatchObject({
      type: "PERSONAL",
      description: null,
      end_at: null,
      event_id: null,
      task_id: null,
      project_id: null,
      created_by_id: null,
    });
    expect(row.start_at).toBeInstanceOf(Date);
    expect(row.created_at).toBeInstanceOf(Date);
    expect(row.updated_at).toBeInstanceOf(Date);
  });

  it("stores every supported explicit projection source", async () => {
    const userId = await insertUser();
    const [event, task, project] = await Promise.all([
      insertEvent(),
      insertTask(),
      insertProject(),
    ]);

    await expect(
      insertEntry({ type: "EVENT", user_id: userId, event_id: event }),
    ).resolves.toMatchObject({ type: "EVENT", event_id: event });
    await expect(
      insertEntry({ type: "TASK", user_id: userId, task_id: task }),
    ).resolves.toMatchObject({ type: "TASK", task_id: task });
    await expect(
      insertEntry({ type: "PROJECT", user_id: userId, project_id: project }),
    ).resolves.toMatchObject({ type: "PROJECT", project_id: project });
    await expect(
      insertEntry({ type: "REMINDER", user_id: userId }),
    ).resolves.toMatchObject({
      type: "REMINDER",
    });
  });

  describe("source and ownership invariants", () => {
    it("requires a real calendar owner and source record", async () => {
      await expect(
        insertEntry({ user_id: MISSING_UUID }),
      ).rejects.toMatchObject({
        code: PG_ERROR.foreignKeyViolation,
      });
      await expect(
        insertEntry({ type: "EVENT", event_id: MISSING_UUID }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });

    it("requires the source to match its type and reserves unavailable source types", async () => {
      await expect(insertEntry({ type: "EVENT" })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
      await expect(
        insertEntry({ type: "PERSONAL", event_id: await insertEvent() }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        insertEntry({
          type: "EVENT",
          event_id: await insertEvent(),
          task_id: await insertTask(),
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(insertEntry({ type: "MEETING" })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
      await expect(insertEntry({ type: "CAMPAIGN" })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
    });

    it("allows one source projection per user and cascades it with the source", async () => {
      const userId = await insertUser();
      const eventId = await insertEvent();
      const entry = await insertEntry({
        type: "EVENT",
        user_id: userId,
        event_id: eventId,
      });

      await expect(
        insertEntry({ type: "EVENT", user_id: userId, event_id: eventId }),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });

      await db.query(`DELETE FROM events WHERE id = $1`, [eventId]);
      const [deleted] = await db.query<{ id: string }>(
        `SELECT id FROM calendar_entries WHERE id = $1`,
        [entry.id],
      );
      expect(deleted).toBeUndefined();
    });

    it("cascades entries with their owner and clears a separate creator", async () => {
      const ownerId = await insertUser();
      const creatorId = await insertUser();
      const entry = await insertEntry({
        user_id: ownerId,
        created_by_id: creatorId,
      });

      await db.query(`DELETE FROM users WHERE id = $1`, [creatorId]);
      const [afterCreatorRemoval] = await db.query<{
        created_by_id: string | null;
      }>(`SELECT created_by_id FROM calendar_entries WHERE id = $1`, [
        entry.id,
      ]);
      expect(afterCreatorRemoval?.created_by_id).toBeNull();

      await db.query(`DELETE FROM users WHERE id = $1`, [ownerId]);
      const [afterOwnerRemoval] = await db.query<{ id: string }>(
        `SELECT id FROM calendar_entries WHERE id = $1`,
        [entry.id],
      );
      expect(afterOwnerRemoval).toBeUndefined();
    });
  });

  describe("text and schedule invariants", () => {
    it("rejects blank text while preserving a nullable description", async () => {
      await expect(insertEntry({ title: "  " })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
      await expect(insertEntry({ description: "" })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
      await expect(insertEntry({ description: null })).resolves.toMatchObject({
        description: null,
      });
    });

    it("requires a UTC start and rejects an end before it", async () => {
      await expect(
        db.query(
          `INSERT INTO calendar_entries (title, type, user_id)
           VALUES ($1, 'PERSONAL', $2)`,
          [unique("Unscheduled"), await insertUser()],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.notNullViolation });
      await expect(
        insertEntry({
          start_at: "2026-10-02T09:00:00.000Z",
          end_at: "2026-10-01T09:00:00.000Z",
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });
  });

  it("creates the required access-path indexes and applies every migration", async () => {
    const indexes = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'calendar_entries'`,
    );
    expect(indexes.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        "calendar_entries_user_id_start_at_idx",
        "calendar_entries_type_start_at_idx",
      ]),
    );

    const [row] = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "_prisma_migrations"
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    expect(Number(row!.count)).toBeGreaterThanOrEqual(19);
  });
});
