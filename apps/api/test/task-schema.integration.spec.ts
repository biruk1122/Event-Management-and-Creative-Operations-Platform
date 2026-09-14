import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

interface TaskRow {
  id: string;
  workspace_id: string | null;
  department_id: string | null;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  progress: number;
  start_at: Date | null;
  due_at: Date | null;
  created_by_id: string | null;
  created_at: Date;
  updated_at: Date;
}

describe("task assignment and collaboration schema", () => {
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
    return `${prefix}-${counter}`;
  }

  async function insertUser(): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ($1) RETURNING id`,
      [`${unique("task-user")}@example.test`],
    );
    return row!.id;
  }

  async function insertWorkspace(): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO workspaces (kind) VALUES ('PROJECT') RETURNING id`,
    );
    return row!.id;
  }

  async function insertDepartment(): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO departments (name) VALUES ($1) RETURNING id`,
      [unique("Task Department")],
    );
    return row!.id;
  }

  async function insertTask(
    columns: Record<string, unknown> = {},
  ): Promise<TaskRow> {
    const base: Record<string, unknown> = {
      workspace_id: await insertWorkspace(),
      title: unique("Task"),
      ...columns,
    };
    const keys = Object.keys(base);
    const values = Object.values(base);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<TaskRow & Record<string, unknown>>(
      `INSERT INTO tasks (${keys.join(", ")})
       VALUES (${placeholders})
       RETURNING *`,
      values,
    );
    return row!;
  }

  async function finalizeManagedFileForTask(taskId: string): Promise<string> {
    const now = new Date().toISOString();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const [row] = await db.query<{ id: string }>(
      `WITH managed_file AS (
         INSERT INTO managed_files (
           storage_key,
           original_filename,
           declared_media_type,
           declared_size_bytes,
           verified_media_type,
           verified_size_bytes,
           state,
           intent_expires_at,
           uploaded_at,
           available_at
         )
         VALUES ($1, 'task-brief.pdf', 'application/pdf', 512,
                 'application/pdf', 512, 'AVAILABLE', $2, $3, $3)
         RETURNING id
       ), attachment AS (
         INSERT INTO task_attachments (task_id, managed_file_id)
         SELECT $4, id FROM managed_file
       )
       SELECT id FROM managed_file`,
      [`managed/${unique("task-object")}`, tomorrow, now, taskId],
    );
    return row!.id;
  }

  async function insertPendingManagedFile(): Promise<string> {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO managed_files (
         storage_key,
         original_filename,
         declared_media_type,
         declared_size_bytes,
         intent_expires_at
       ) VALUES ($1, 'draft.pdf', 'application/pdf', 512, $2)
       RETURNING id`,
      [`managed/${unique("pending-task-object")}`, tomorrow],
    );
    return row!.id;
  }

  it("creates workspace and department tasks with server defaults", async () => {
    const workspaceTask = await insertTask();
    const departmentId = await insertDepartment();
    const departmentTask = await insertTask({
      workspace_id: null,
      department_id: departmentId,
    });

    expect(workspaceTask).toMatchObject({
      department_id: null,
      priority: "MEDIUM",
      status: "TODO",
      progress: 0,
      start_at: null,
      due_at: null,
      created_by_id: null,
    });
    expect(workspaceTask.id).toEqual(expect.any(String));
    expect(workspaceTask.created_at).toBeInstanceOf(Date);
    expect(workspaceTask.updated_at).toBeInstanceOf(Date);
    expect(departmentTask).toMatchObject({
      workspace_id: null,
      department_id: departmentId,
    });
  });

  describe("task ownership and content invariants", () => {
    it("requires at least one real owner and preserves owners in use", async () => {
      await expect(
        insertTask({ workspace_id: null, department_id: null }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        insertTask({ workspace_id: MISSING_UUID }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
      await expect(
        insertTask({ workspace_id: null, department_id: MISSING_UUID }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });

      const task = await insertTask();
      await expect(
        db.query(`DELETE FROM workspaces WHERE id = $1`, [task.workspace_id]),
      ).rejects.toMatchObject({ code: PG_ERROR.restrictViolation });
    });

    it("rejects blank text, out-of-range progress, and reversed dates", async () => {
      await expect(insertTask({ title: "   " })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
      await expect(insertTask({ description: "" })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
      await expect(insertTask({ progress: -1 })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
      await expect(insertTask({ progress: 101 })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
      await expect(
        insertTask({
          start_at: "2026-10-02T09:00:00.000Z",
          due_at: "2026-10-01T09:00:00.000Z",
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("accepts every approved priority and persistent status", async () => {
      for (const priority of ["LOW", "MEDIUM", "HIGH", "URGENT"]) {
        await expect(insertTask({ priority })).resolves.toMatchObject({
          priority,
        });
      }
      for (const status of [
        "TODO",
        "IN_PROGRESS",
        "UNDER_REVIEW",
        "BLOCKED",
        "COMPLETED",
        "CANCELLED",
      ]) {
        await expect(insertTask({ status })).resolves.toMatchObject({ status });
      }
      await expect(insertTask({ status: "APPROVED" })).rejects.toMatchObject({
        code: PG_ERROR.invalidTextRepresentation,
      });
    });

    it("clears creator attribution when the user is removed", async () => {
      const creatorId = await insertUser();
      const task = await insertTask({ created_by_id: creatorId });

      await db.query(`DELETE FROM users WHERE id = $1`, [creatorId]);

      const [row] = await db.query<{ created_by_id: string | null }>(
        `SELECT created_by_id FROM tasks WHERE id = $1`,
        [task.id],
      );
      expect(row?.created_by_id).toBeNull();
    });
  });

  describe("assignments and collaboration records", () => {
    it("supports several assignees but rejects a duplicate task/user pair", async () => {
      const task = await insertTask();
      const firstAssignee = await insertUser();
      const secondAssignee = await insertUser();
      const assignedBy = await insertUser();

      await db.query(
        `INSERT INTO task_assignments (task_id, user_id, assigned_by_id)
         VALUES ($1, $2, $4), ($1, $3, $4)`,
        [task.id, firstAssignee, secondAssignee, assignedBy],
      );
      await expect(
        db.query(
          `INSERT INTO task_assignments (task_id, user_id)
           VALUES ($1, $2)`,
          [task.id, firstAssignee],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });

      const [count] = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM task_assignments WHERE task_id = $1`,
        [task.id],
      );
      expect(count?.count).toBe("2");
    });

    it("stores nonblank comments and unique normalized mentions", async () => {
      const task = await insertTask();
      const authorId = await insertUser();
      const mentionedId = await insertUser();
      const [comment] = await db.query<{ id: string }>(
        `INSERT INTO task_comments (task_id, author_id, content)
         VALUES ($1, $2, 'Please review @teammate') RETURNING id`,
        [task.id, authorId],
      );
      await db.query(
        `INSERT INTO task_comment_mentions (comment_id, user_id)
         VALUES ($1, $2)`,
        [comment!.id, mentionedId],
      );

      await expect(
        db.query(
          `INSERT INTO task_comment_mentions (comment_id, user_id)
           VALUES ($1, $2)`,
          [comment!.id, mentionedId],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
      await expect(
        db.query(
          `INSERT INTO task_comments (task_id, content) VALUES ($1, '   ')`,
          [task.id],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("stores review outcomes separately from task status and allows review cycles", async () => {
      const task = await insertTask({ status: "UNDER_REVIEW" });
      const reviewerId = await insertUser();

      await db.query(
        `INSERT INTO task_reviews (task_id, reviewer_id, outcome, note)
         VALUES ($1, $2, 'CHANGES_REQUESTED', 'Please update the brief'),
                ($1, $2, 'APPROVED', 'Ready to publish')`,
        [task.id, reviewerId],
      );
      const rows = await db.query<{ outcome: string }>(
        `SELECT outcome FROM task_reviews WHERE task_id = $1`,
        [task.id],
      );
      expect(rows.map(({ outcome }) => outcome)).toHaveLength(2);
      expect(rows.map(({ outcome }) => outcome)).toEqual(
        expect.arrayContaining(["CHANGES_REQUESTED", "APPROVED"]),
      );
      await expect(
        db.query(
          `INSERT INTO task_reviews (task_id, outcome, note)
           VALUES ($1, 'APPROVED', '  ')`,
          [task.id],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("stores typed activity with object details", async () => {
      const task = await insertTask();
      const actorId = await insertUser();
      const [activity] = await db.query<{
        type: string;
        details: Record<string, unknown>;
      }>(
        `INSERT INTO task_activities (task_id, actor_id, type, details)
         VALUES ($1, $2, 'STATUS_CHANGED', $3::jsonb)
         RETURNING type, details`,
        [task.id, actorId, JSON.stringify({ from: "TODO", to: "IN_PROGRESS" })],
      );
      expect(activity).toMatchObject({
        type: "STATUS_CHANGED",
        details: { from: "TODO", to: "IN_PROGRESS" },
      });
      await expect(
        db.query(
          `INSERT INTO task_activities (task_id, type, details)
           VALUES ($1, 'UPDATED', '[]'::jsonb)`,
          [task.id],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });
  });

  describe("managed task attachments", () => {
    it("rejects pending files and allows atomic task-owned finalization", async () => {
      const task = await insertTask();
      const pendingFileId = await insertPendingManagedFile();

      await expect(
        db.query(
          `INSERT INTO task_attachments (task_id, managed_file_id)
           VALUES ($1, $2)`,
          [task.id, pendingFileId],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });

      const availableFileId = await finalizeManagedFileForTask(task.id);
      await expect(
        db.query(
          `INSERT INTO task_attachments (task_id, managed_file_id)
           VALUES ($1, $2)`,
          [task.id, availableFileId],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });

    it("prevents an available file from becoming orphaned with its task", async () => {
      const departmentId = await insertDepartment();
      const task = await insertTask({
        workspace_id: null,
        department_id: departmentId,
      });
      await finalizeManagedFileForTask(task.id);

      await expect(
        db.query(`DELETE FROM tasks WHERE id = $1`, [task.id]),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("checks the previous file when an attachment is changed", async () => {
      const firstTask = await insertTask();
      const secondTask = await insertTask();
      const firstFileId = await finalizeManagedFileForTask(firstTask.id);
      const secondFileId = await finalizeManagedFileForTask(secondTask.id);

      await expect(
        db.query(
          `UPDATE task_attachments
           SET managed_file_id = $1
           WHERE task_id = $2 AND managed_file_id = $3`,
          [secondFileId, firstTask.id, firstFileId],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("serializes concurrent removals across explicit parent tables", async () => {
      const task = await insertTask();
      const managedFileId = await finalizeManagedFileForTask(task.id);
      const workspaceId = await insertWorkspace();
      await db.query(
        `INSERT INTO workspace_file_attachments (workspace_id, managed_file_id)
         VALUES ($1, $2)`,
        [workspaceId, managedFileId],
      );

      const workspaceClient = new Client({ connectionString: db.url });
      const taskClient = new Client({ connectionString: db.url });
      await Promise.all([workspaceClient.connect(), taskClient.connect()]);
      try {
        await Promise.all([
          workspaceClient.query("BEGIN"),
          taskClient.query("BEGIN"),
        ]);
        await workspaceClient.query(
          `DELETE FROM workspace_file_attachments
           WHERE workspace_id = $1 AND managed_file_id = $2`,
          [workspaceId, managedFileId],
        );
        await taskClient.query(
          `DELETE FROM task_attachments
           WHERE task_id = $1 AND managed_file_id = $2`,
          [task.id, managedFileId],
        );

        const commits = await Promise.allSettled([
          workspaceClient.query("COMMIT"),
          taskClient.query("COMMIT"),
        ]);
        expect(
          commits.filter(({ status }) => status === "fulfilled"),
        ).toHaveLength(1);
        const failedCommit = commits.find(
          ({ status }) => status === "rejected",
        );
        expect(failedCommit).toMatchObject({
          status: "rejected",
          reason: { code: PG_ERROR.checkViolation },
        });

        const [row] = await db.query<{ count: string }>(
          `SELECT (
             (SELECT count(*) FROM workspace_file_attachments WHERE managed_file_id = $1)
             +
             (SELECT count(*) FROM task_attachments WHERE managed_file_id = $1)
           )::text AS count`,
          [managedFileId],
        );
        expect(row?.count).toBe("1");
      } finally {
        await Promise.allSettled([workspaceClient.end(), taskClient.end()]);
      }
    });
  });

  it("cascades task-owned rows and preserves attributed history where applicable", async () => {
    const task = await insertTask();
    const userId = await insertUser();
    await db.query(
      `INSERT INTO task_assignments (task_id, user_id) VALUES ($1, $2)`,
      [task.id, userId],
    );
    await db.query(
      `INSERT INTO task_comments (task_id, author_id, content)
       VALUES ($1, $2, 'Update')`,
      [task.id, userId],
    );
    await db.query(
      `INSERT INTO task_reviews (task_id, reviewer_id, outcome)
       VALUES ($1, $2, 'APPROVED')`,
      [task.id, userId],
    );
    await db.query(
      `INSERT INTO task_activities (task_id, actor_id, type)
       VALUES ($1, $2, 'UPDATED')`,
      [task.id, userId],
    );

    await db.query(`DELETE FROM tasks WHERE id = $1`, [task.id]);

    for (const table of [
      "task_assignments",
      "task_comments",
      "task_reviews",
      "task_activities",
    ]) {
      const [row] = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ${table} WHERE task_id = $1`,
        [task.id],
      );
      expect(row?.count).toBe("0");
    }
  });

  it("creates task access indexes and applies every committed migration", async () => {
    const indexes = await db.query<{ indexname: string }>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = current_schema()
         AND tablename IN ('tasks', 'task_assignments', 'task_comments', 'task_activities')`,
    );
    expect(indexes.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        "tasks_workspace_id_status_updated_at_idx",
        "tasks_department_id_status_updated_at_idx",
        "tasks_status_due_at_idx",
        "tasks_start_at_idx",
        "tasks_due_at_idx",
        "task_assignments_user_id_assigned_at_idx",
        "task_comments_task_id_created_at_idx",
        "task_activities_task_id_occurred_at_idx",
      ]),
    );

    const [row] = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "_prisma_migrations"
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    expect(Number(row!.count)).toBeGreaterThanOrEqual(13);
  });
});
