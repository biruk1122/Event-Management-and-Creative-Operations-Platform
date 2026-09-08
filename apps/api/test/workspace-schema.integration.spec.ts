import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

interface WorkspaceRow {
  id: string;
  kind: string;
  manager_id: string | null;
  created_at: Date;
  updated_at: Date;
}

describe("connected workspace ownership schema", () => {
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
    email = `${unique("user").replace(" ", "")}@workspace.test`,
  ): Promise<{ id: string }> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ($1) RETURNING id`,
      [email],
    );
    return row!;
  }

  async function insertDepartment(
    name = unique("Dept"),
  ): Promise<{ id: string }> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO departments (name) VALUES ($1) RETURNING id`,
      [name],
    );
    return row!;
  }

  async function insertTeam(
    departmentId: string,
    name = unique("Team"),
  ): Promise<{ id: string }> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO teams (name, department_id) VALUES ($1, $2) RETURNING id`,
      [name, departmentId],
    );
    return row!;
  }

  async function insertWorkspace(
    kind = "EVENT",
    columns: Record<string, unknown> = {},
  ): Promise<WorkspaceRow> {
    const keys = ["kind", ...Object.keys(columns)];
    const values = [kind, ...Object.values(columns)];
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<WorkspaceRow & Record<string, unknown>>(
      `INSERT INTO workspaces (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
    return row!;
  }

  it("creates a workspace root with server defaults", async () => {
    const row = await insertWorkspace("PROJECT");

    expect(row.id).toEqual(expect.any(String));
    expect(row.kind).toBe("PROJECT");
    expect(row.manager_id).toBeNull();
    expect(row.created_at).toBeInstanceOf(Date);
    expect(row.updated_at).toBeInstanceOf(Date);
  });

  it("round-trips a workspace with a manager assigned", async () => {
    const manager = await insertUser("workspace.manager@workspace.test");
    const row = await insertWorkspace("CAMPAIGN", { manager_id: manager.id });

    expect(row).toMatchObject({ kind: "CAMPAIGN", manager_id: manager.id });
  });

  describe("kind discriminator", () => {
    it("accepts each of the four owning module kinds", async () => {
      for (const kind of ["EVENT", "PROJECT", "PRODUCTION", "CAMPAIGN"]) {
        await expect(insertWorkspace(kind)).resolves.toMatchObject({ kind });
      }
    });

    it("rejects a kind outside the enum", async () => {
      await expect(insertWorkspace("MEETING")).rejects.toMatchObject({
        code: PG_ERROR.invalidTextRepresentation,
      });
    });

    it("requires a kind", async () => {
      await expect(
        db.query(`INSERT INTO workspaces DEFAULT VALUES`),
      ).rejects.toMatchObject({ code: PG_ERROR.notNullViolation });
    });
  });

  describe("manager slot", () => {
    it("rejects a manager id that is not a real user", async () => {
      await expect(
        insertWorkspace("EVENT", { manager_id: MISSING_UUID }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });

    it("clears the manager slot when the manager user is removed", async () => {
      const manager = await insertUser("leaving.owner@workspace.test");
      const workspace = await insertWorkspace("EVENT", {
        manager_id: manager.id,
      });

      await db.query(`DELETE FROM users WHERE id = $1`, [manager.id]);

      const [row] = await db.query<{ manager_id: string | null }>(
        `SELECT manager_id FROM workspaces WHERE id = $1`,
        [workspace.id],
      );
      expect(row?.manager_id).toBeNull();
    });
  });

  describe("team assignments", () => {
    async function assignTeam(
      workspaceId: string,
      teamId: string,
    ): Promise<void> {
      await db.query(
        `INSERT INTO workspace_teams (workspace_id, team_id) VALUES ($1, $2)`,
        [workspaceId, teamId],
      );
    }

    it("links a team to a workspace and reads it back", async () => {
      const department = await insertDepartment();
      const team = await insertTeam(department.id);
      const workspace = await insertWorkspace("EVENT");

      await assignTeam(workspace.id, team.id);

      const [row] = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM workspace_teams WHERE workspace_id = $1`,
        [workspace.id],
      );
      expect(row?.count).toBe("1");
    });

    it("rejects assigning the same team to one workspace twice", async () => {
      const department = await insertDepartment();
      const team = await insertTeam(department.id);
      const workspace = await insertWorkspace("EVENT");
      await assignTeam(workspace.id, team.id);

      await expect(assignTeam(workspace.id, team.id)).rejects.toMatchObject({
        code: PG_ERROR.uniqueViolation,
      });
    });

    it("lets one team serve several workspaces", async () => {
      const department = await insertDepartment();
      const team = await insertTeam(department.id);
      const first = await insertWorkspace("EVENT");
      const second = await insertWorkspace("PROJECT");

      await assignTeam(first.id, team.id);
      await assignTeam(second.id, team.id);

      const [row] = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM workspace_teams WHERE team_id = $1`,
        [team.id],
      );
      expect(row?.count).toBe("2");
    });

    it("rejects assignment rows that point at nothing", async () => {
      const department = await insertDepartment();
      const team = await insertTeam(department.id);
      const workspace = await insertWorkspace("EVENT");

      await expect(assignTeam(MISSING_UUID, team.id)).rejects.toMatchObject({
        code: PG_ERROR.foreignKeyViolation,
      });
      await expect(
        assignTeam(workspace.id, MISSING_UUID),
      ).rejects.toMatchObject({
        code: PG_ERROR.foreignKeyViolation,
      });
    });

    it("drops assignment rows when the workspace is deleted", async () => {
      const department = await insertDepartment();
      const team = await insertTeam(department.id);
      const workspace = await insertWorkspace("EVENT");
      await assignTeam(workspace.id, team.id);

      await db.query(`DELETE FROM workspaces WHERE id = $1`, [workspace.id]);

      const [row] = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM workspace_teams WHERE team_id = $1`,
        [team.id],
      );
      expect(row?.count).toBe("0");
      const [survivor] = await db.query<{ id: string }>(
        `SELECT id FROM teams WHERE id = $1`,
        [team.id],
      );
      expect(survivor?.id).toBe(team.id);
    });

    it("drops assignment rows when the team is deleted", async () => {
      const department = await insertDepartment();
      const team = await insertTeam(department.id);
      const workspace = await insertWorkspace("EVENT");
      await assignTeam(workspace.id, team.id);

      await db.query(`DELETE FROM teams WHERE id = $1`, [team.id]);

      const [row] = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM workspace_teams WHERE workspace_id = $1`,
        [workspace.id],
      );
      expect(row?.count).toBe("0");
      const [survivor] = await db.query<{ id: string }>(
        `SELECT id FROM workspaces WHERE id = $1`,
        [workspace.id],
      );
      expect(survivor?.id).toBe(workspace.id);
    });
  });

  describe("participants", () => {
    async function addParticipant(
      workspaceId: string,
      userId: string,
    ): Promise<void> {
      await db.query(
        `INSERT INTO workspace_participants (workspace_id, user_id) VALUES ($1, $2)`,
        [workspaceId, userId],
      );
    }

    it("links a user to a workspace and reads it back", async () => {
      const workspace = await insertWorkspace("PROJECT");
      const user = await insertUser();

      await addParticipant(workspace.id, user.id);

      const [row] = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM workspace_participants WHERE workspace_id = $1`,
        [workspace.id],
      );
      expect(row?.count).toBe("1");
    });

    it("rejects the same user in the same workspace twice", async () => {
      const workspace = await insertWorkspace("PROJECT");
      const user = await insertUser();
      await addParticipant(workspace.id, user.id);

      await expect(addParticipant(workspace.id, user.id)).rejects.toMatchObject(
        { code: PG_ERROR.uniqueViolation },
      );
    });

    it("lets one user participate in several workspaces", async () => {
      const first = await insertWorkspace("EVENT");
      const second = await insertWorkspace("CAMPAIGN");
      const user = await insertUser();

      await addParticipant(first.id, user.id);
      await addParticipant(second.id, user.id);

      const [row] = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM workspace_participants WHERE user_id = $1`,
        [user.id],
      );
      expect(row?.count).toBe("2");
    });

    it("rejects participant rows that point at nothing", async () => {
      const workspace = await insertWorkspace("EVENT");
      const user = await insertUser();

      await expect(addParticipant(MISSING_UUID, user.id)).rejects.toMatchObject(
        { code: PG_ERROR.foreignKeyViolation },
      );
      await expect(
        addParticipant(workspace.id, MISSING_UUID),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });

    it("drops participant rows when the workspace is deleted", async () => {
      const workspace = await insertWorkspace("EVENT");
      const user = await insertUser();
      await addParticipant(workspace.id, user.id);

      await db.query(`DELETE FROM workspaces WHERE id = $1`, [workspace.id]);

      const [row] = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM workspace_participants WHERE user_id = $1`,
        [user.id],
      );
      expect(row?.count).toBe("0");
      const [survivor] = await db.query<{ id: string }>(
        `SELECT id FROM users WHERE id = $1`,
        [user.id],
      );
      expect(survivor?.id).toBe(user.id);
    });

    it("drops participant rows when the user is deleted", async () => {
      const workspace = await insertWorkspace("EVENT");
      const user = await insertUser();
      await addParticipant(workspace.id, user.id);

      await db.query(`DELETE FROM users WHERE id = $1`, [user.id]);

      const [row] = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM workspace_participants WHERE workspace_id = $1`,
        [workspace.id],
      );
      expect(row?.count).toBe("0");
      const [survivor] = await db.query<{ id: string }>(
        `SELECT id FROM workspaces WHERE id = $1`,
        [workspace.id],
      );
      expect(survivor?.id).toBe(workspace.id);
    });
  });

  it("reports every committed migration as applied", async () => {
    const [row] = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    expect(Number(row!.count)).toBeGreaterThanOrEqual(8);
  });
});
