import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

interface ProjectRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  start_at: Date | null;
  end_at: Date | null;
  status: string;
  event_id: string | null;
  created_by_id: string | null;
  created_at: Date;
  updated_at: Date;
}

describe("general project management schema", () => {
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
    email = `${unique("user").replace(" ", "")}@project.test`,
  ): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ($1) RETURNING id`,
      [email],
    );
    return row!.id;
  }

  async function insertWorkspace(kind = "PROJECT"): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO workspaces (kind) VALUES ($1) RETURNING id`,
      [kind],
    );
    return row!.id;
  }

  async function insertEvent(): Promise<string> {
    const workspaceId = await insertWorkspace("EVENT");
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO events (workspace_id, name, event_type) VALUES ($1, $2, 'CONCERT') RETURNING id`,
      [workspaceId, unique("Event")],
    );
    return row!.id;
  }

  async function insertProject(
    columns: Record<string, unknown> = {},
  ): Promise<ProjectRow> {
    const base: Record<string, unknown> = {
      workspace_id: await insertWorkspace(),
      name: unique("Project"),
      ...columns,
    };
    const keys = Object.keys(base);
    const values = Object.values(base);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<ProjectRow & Record<string, unknown>>(
      `INSERT INTO projects (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
    return row!;
  }

  it("creates a project with server defaults", async () => {
    const row = await insertProject();

    expect(row.id).toEqual(expect.any(String));
    expect(row.status).toBe("PLANNED");
    expect(row.description).toBeNull();
    expect(row.start_at).toBeNull();
    expect(row.end_at).toBeNull();
    expect(row.event_id).toBeNull();
    expect(row.created_by_id).toBeNull();
    expect(row.created_at).toBeInstanceOf(Date);
    expect(row.updated_at).toBeInstanceOf(Date);
  });

  it("round-trips a fully populated project", async () => {
    const creator = await insertUser("creator@project.test");
    const eventId = await insertEvent();
    const row = await insertProject({
      name: "Brand Refresh",
      description: "Redesign the visual identity.",
      start_at: "2026-11-01T09:00:00.000Z",
      end_at: "2026-12-15T17:00:00.000Z",
      status: "ACTIVE",
      event_id: eventId,
      created_by_id: creator,
    });

    expect(row).toMatchObject({
      name: "Brand Refresh",
      description: "Redesign the visual identity.",
      status: "ACTIVE",
      event_id: eventId,
      created_by_id: creator,
    });
    expect(row.start_at).toBeInstanceOf(Date);
    expect(row.end_at).toBeInstanceOf(Date);
  });

  describe("connected workspace link", () => {
    it("requires a workspace id", async () => {
      await expect(
        db.query(`INSERT INTO projects (name) VALUES ($1)`, [
          unique("Project"),
        ]),
      ).rejects.toMatchObject({ code: PG_ERROR.notNullViolation });
    });

    it("rejects a workspace id that is not a real workspace", async () => {
      await expect(
        insertProject({ workspace_id: MISSING_UUID }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });

    it("allows only one project per workspace", async () => {
      const workspaceId = await insertWorkspace();
      await insertProject({ workspace_id: workspaceId });

      await expect(
        insertProject({ workspace_id: workspaceId }),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });

    it("refuses to delete a workspace that a project still owns", async () => {
      const project = await insertProject();

      // `ON DELETE RESTRICT` raises its own SQLSTATE, distinct from the plain
      // foreign-key-violation code used for a bad reference on insert.
      await expect(
        db.query(`DELETE FROM workspaces WHERE id = $1`, [
          project.workspace_id,
        ]),
      ).rejects.toMatchObject({ code: PG_ERROR.restrictViolation });

      const [survivor] = await db.query<{ id: string }>(
        `SELECT id FROM projects WHERE id = $1`,
        [project.id],
      );
      expect(survivor?.id).toBe(project.id);
    });
  });

  describe("lifecycle status", () => {
    it("accepts every status and rejects an unknown one", async () => {
      for (const status of ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"]) {
        await expect(insertProject({ status })).resolves.toMatchObject({
          status,
        });
      }
      await expect(insertProject({ status: "ON_HOLD" })).rejects.toMatchObject({
        code: PG_ERROR.invalidTextRepresentation,
      });
    });
  });

  describe("text invariants", () => {
    it("rejects a blank or whitespace-only name", async () => {
      await expect(insertProject({ name: "" })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
      await expect(insertProject({ name: "   " })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
    });

    it("rejects a blank description but allows null", async () => {
      await expect(insertProject({ description: "  " })).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
      await expect(insertProject({ description: null })).resolves.toMatchObject(
        { description: null },
      );
    });
  });

  describe("schedule ordering", () => {
    it("allows an end at or after the start, and either end open", async () => {
      await expect(
        insertProject({
          start_at: "2026-01-01T10:00:00.000Z",
          end_at: "2026-01-01T10:00:00.000Z",
        }),
      ).resolves.toBeTruthy();
      await expect(
        insertProject({ start_at: "2026-01-01T10:00:00.000Z", end_at: null }),
      ).resolves.toBeTruthy();
      await expect(
        insertProject({ start_at: null, end_at: "2026-01-01T10:00:00.000Z" }),
      ).resolves.toBeTruthy();
    });

    it("rejects an end before the start", async () => {
      await expect(
        insertProject({
          start_at: "2026-01-02T10:00:00.000Z",
          end_at: "2026-01-01T10:00:00.000Z",
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });
  });

  describe("optional event link", () => {
    it("rejects an event id that is not a real event", async () => {
      await expect(
        insertProject({ event_id: MISSING_UUID }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });

    it("allows several projects to relate to the same event", async () => {
      const eventId = await insertEvent();
      await expect(insertProject({ event_id: eventId })).resolves.toMatchObject(
        { event_id: eventId },
      );
      await expect(insertProject({ event_id: eventId })).resolves.toMatchObject(
        { event_id: eventId },
      );
    });

    it("clears the link, not the project, when the event is removed", async () => {
      const eventId = await insertEvent();
      const project = await insertProject({ event_id: eventId });

      // The event-to-project link is a soft cross-reference (SET NULL), not
      // ownership: removing the event survives the project.
      await db.query(`DELETE FROM events WHERE id = $1`, [eventId]);

      const [row] = await db.query<{
        id: string;
        event_id: string | null;
      }>(`SELECT id, event_id FROM projects WHERE id = $1`, [project.id]);
      expect(row?.id).toBe(project.id);
      expect(row?.event_id).toBeNull();
    });
  });

  describe("creator link", () => {
    it("rejects a creator id that is not a real user", async () => {
      await expect(
        insertProject({ created_by_id: MISSING_UUID }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });

    it("clears the creator when that user is removed", async () => {
      const creator = await insertUser("leaving.author@project.test");
      const project = await insertProject({ created_by_id: creator });

      await db.query(`DELETE FROM users WHERE id = $1`, [creator]);

      const [row] = await db.query<{ created_by_id: string | null }>(
        `SELECT created_by_id FROM projects WHERE id = $1`,
        [project.id],
      );
      expect(row?.created_by_id).toBeNull();
    });
  });

  it("reports every committed migration as applied", async () => {
    const [row] = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    expect(Number(row!.count)).toBeGreaterThanOrEqual(10);
  });
});
