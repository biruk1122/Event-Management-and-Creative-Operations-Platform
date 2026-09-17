import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

interface TodoRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  status: string;
  due_date: string | null;
  due_time: string | null;
  related_event_id: string | null;
  related_project_id: string | null;
  reminder_enabled: boolean;
  created_by_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface TodoReminderRow {
  id: string;
  todo_id: string;
  reminder_at: Date;
  sent: boolean;
  created_at: Date;
}

describe("personal to-do and reminders schema", () => {
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
      [`todo-${counter}@example.test`],
    );
    return row!.id;
  }

  async function insertEvent(): Promise<string> {
    const [workspace] = await db.query<{ id: string }>(
      `INSERT INTO workspaces (kind) VALUES ('EVENT') RETURNING id`,
    );
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO events (workspace_id, name, event_type)
       VALUES ($1, $2, 'CONCERT') RETURNING id`,
      [workspace!.id, unique("Event")],
    );
    return row!.id;
  }

  async function insertProject(): Promise<string> {
    const [workspace] = await db.query<{ id: string }>(
      `INSERT INTO workspaces (kind) VALUES ('PROJECT') RETURNING id`,
    );
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO projects (workspace_id, name) VALUES ($1, $2) RETURNING id`,
      [workspace!.id, unique("Project")],
    );
    return row!.id;
  }

  async function insertTodo(
    columns: Record<string, unknown> = {},
  ): Promise<TodoRow> {
    const base: Record<string, unknown> = {
      title: unique("Todo"),
      user_id: await insertUser(),
      ...columns,
    };
    const keys = Object.keys(base);
    const values = Object.values(base);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<TodoRow & Record<string, unknown>>(
      `INSERT INTO todos (${keys.join(", ")})
       VALUES (${placeholders}) RETURNING *`,
      values,
    );
    return row!;
  }

  async function insertReminder(
    todoId: string,
    columns: Record<string, unknown> = {},
  ): Promise<TodoReminderRow> {
    const base: Record<string, unknown> = {
      todo_id: todoId,
      reminder_at: "2026-10-01T09:00:00.000Z",
      ...columns,
    };
    const keys = Object.keys(base);
    const values = Object.values(base);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<TodoReminderRow & Record<string, unknown>>(
      `INSERT INTO todo_reminders (${keys.join(", ")})
       VALUES (${placeholders}) RETURNING *`,
      values,
    );
    return row!;
  }

  it("creates a todo with server defaults", async () => {
    const row = await insertTodo();

    expect(row).toMatchObject({
      type: "PERSONAL",
      priority: "MEDIUM",
      status: "NOT_STARTED",
      description: null,
      due_date: null,
      due_time: null,
      related_event_id: null,
      related_project_id: null,
      reminder_enabled: false,
      created_by_id: null,
    });
    expect(row.created_at).toBeInstanceOf(Date);
    expect(row.updated_at).toBeInstanceOf(Date);
  });

  it("stores every supported to-do type", async () => {
    for (const type of [
      "PERSONAL",
      "WORK",
      "REMINDER",
      "QUICK_NOTE",
      "FOLLOW_UP",
    ]) {
      await expect(insertTodo({ type })).resolves.toMatchObject({ type });
    }
  });

  it("relates a todo to an event and a project as optional context, not ownership", async () => {
    const eventId = await insertEvent();
    const projectId = await insertProject();

    const withEvent = await insertTodo({ related_event_id: eventId });
    const withProject = await insertTodo({ related_project_id: projectId });
    expect(withEvent.related_event_id).toBe(eventId);
    expect(withProject.related_project_id).toBe(projectId);

    // Deleting the referenced record only clears the reference - the todo
    // itself is the user's own item, not a projection of its source.
    await db.query(`DELETE FROM events WHERE id = $1`, [eventId]);
    await db.query(`DELETE FROM projects WHERE id = $1`, [projectId]);

    const [afterEventRemoval] = await db.query<{
      related_event_id: string | null;
    }>(`SELECT related_event_id FROM todos WHERE id = $1`, [withEvent.id]);
    expect(afterEventRemoval?.related_event_id).toBeNull();

    const [afterProjectRemoval] = await db.query<{
      related_project_id: string | null;
    }>(`SELECT related_project_id FROM todos WHERE id = $1`, [withProject.id]);
    expect(afterProjectRemoval?.related_project_id).toBeNull();
  });

  describe("ownership invariants", () => {
    it("requires a real owner and a real related event or project when given", async () => {
      await expect(insertTodo({ user_id: MISSING_UUID })).rejects.toMatchObject(
        { code: PG_ERROR.foreignKeyViolation },
      );
      await expect(
        insertTodo({ related_event_id: MISSING_UUID }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
      await expect(
        insertTodo({ related_project_id: MISSING_UUID }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });

    it("cascades todos with their owner and clears a separate creator", async () => {
      const ownerId = await insertUser();
      const creatorId = await insertUser();
      const todo = await insertTodo({
        user_id: ownerId,
        created_by_id: creatorId,
      });

      await db.query(`DELETE FROM users WHERE id = $1`, [creatorId]);
      const [afterCreatorRemoval] = await db.query<{
        created_by_id: string | null;
      }>(`SELECT created_by_id FROM todos WHERE id = $1`, [todo.id]);
      expect(afterCreatorRemoval?.created_by_id).toBeNull();

      await db.query(`DELETE FROM users WHERE id = $1`, [ownerId]);
      const [afterOwnerRemoval] = await db.query<{ id: string }>(
        `SELECT id FROM todos WHERE id = $1`,
        [todo.id],
      );
      expect(afterOwnerRemoval).toBeUndefined();
    });
  });

  describe("text and schedule invariants", () => {
    it("rejects blank text while preserving a nullable description", async () => {
      await expect(insertTodo({ title: "  " })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
      await expect(insertTodo({ description: "" })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
      await expect(insertTodo({ description: null })).resolves.toMatchObject({
        description: null,
      });
    });

    it("allows a due date without a time but rejects a time without its date", async () => {
      // `due_date::text`/`due_time::text` avoid `pg`'s driver-local-timezone
      // `Date` coercion for DATE/TIME columns - this asserts the stored SQL
      // value directly, not a JS `Date` round trip.
      const dateOnly = await insertTodo({ due_date: "2026-10-01" });
      const [dateOnlyText] = await db.query<{
        due_date: string;
        due_time: string | null;
      }>(`SELECT due_date::text, due_time::text FROM todos WHERE id = $1`, [
        dateOnly.id,
      ]);
      expect(dateOnlyText).toMatchObject({
        due_date: "2026-10-01",
        due_time: null,
      });

      await expect(insertTodo({ due_time: "09:00:00" })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });

      const both = await insertTodo({
        due_date: "2026-10-01",
        due_time: "09:00:00",
      });
      const [bothText] = await db.query<{
        due_date: string;
        due_time: string;
      }>(`SELECT due_date::text, due_time::text FROM todos WHERE id = $1`, [
        both.id,
      ]);
      expect(bothText).toMatchObject({
        due_date: "2026-10-01",
        due_time: "09:00:00",
      });
    });
  });

  describe("todo reminders", () => {
    it("defaults to unsent and requires a real todo", async () => {
      const todo = await insertTodo();
      const reminder = await insertReminder(todo.id);
      expect(reminder.sent).toBe(false);
      expect(reminder.created_at).toBeInstanceOf(Date);

      await expect(insertReminder(MISSING_UUID)).rejects.toMatchObject({
        code: PG_ERROR.foreignKeyViolation,
      });
    });

    it("rejects a duplicate reminder moment for the same todo", async () => {
      const todo = await insertTodo();
      await insertReminder(todo.id, { reminder_at: "2026-10-01T09:00:00Z" });

      await expect(
        insertReminder(todo.id, { reminder_at: "2026-10-01T09:00:00Z" }),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
      // A different moment for the same todo is unaffected.
      await expect(
        insertReminder(todo.id, { reminder_at: "2026-10-02T09:00:00Z" }),
      ).resolves.toMatchObject({ sent: false });
    });

    it("cascades reminders with their todo", async () => {
      const todo = await insertTodo();
      const reminder = await insertReminder(todo.id);

      await db.query(`DELETE FROM todos WHERE id = $1`, [todo.id]);
      const [deleted] = await db.query<{ id: string }>(
        `SELECT id FROM todo_reminders WHERE id = $1`,
        [reminder.id],
      );
      expect(deleted).toBeUndefined();
    });
  });

  it("creates the required access-path indexes and applies every migration", async () => {
    const todoIndexes = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'todos'`,
    );
    expect(todoIndexes.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        "todos_user_id_status_due_date_idx",
        "todos_user_id_type_idx",
      ]),
    );

    const reminderIndexes = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'todo_reminders'`,
    );
    expect(reminderIndexes.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining(["todo_reminders_sent_reminder_at_idx"]),
    );

    const [row] = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "_prisma_migrations"
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    expect(Number(row!.count)).toBeGreaterThanOrEqual(20);
  });
});
