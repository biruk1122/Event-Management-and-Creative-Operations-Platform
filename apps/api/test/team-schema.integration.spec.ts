import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

interface TeamRow {
  id: string;
  name: string;
  department_id: string;
  description: string | null;
  manager_id: string | null;
  deactivated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

describe("team management schema", () => {
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

  async function insertDepartment(name = unique("Dept")): Promise<{
    id: string;
  }> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO departments (name) VALUES ($1) RETURNING id`,
      [name],
    );
    return row!;
  }

  async function insertUser(
    email = `${unique("user").replace(" ", "")}@team.test`,
  ): Promise<{
    id: string;
  }> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ($1) RETURNING id`,
      [email],
    );
    return row!;
  }

  async function insertTeam(
    departmentId: string,
    name = unique("Team"),
    columns: Record<string, unknown> = {},
  ): Promise<TeamRow> {
    const keys = ["name", "department_id", ...Object.keys(columns)];
    const values = [name, departmentId, ...Object.values(columns)];
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<TeamRow & Record<string, unknown>>(
      `INSERT INTO teams (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
    return row!;
  }

  it("creates a team with server defaults", async () => {
    const department = await insertDepartment();
    const row = await insertTeam(department.id, "Delivery");

    expect(row.id).toEqual(expect.any(String));
    expect(row.department_id).toBe(department.id);
    expect(row.description).toBeNull();
    expect(row.manager_id).toBeNull();
    expect(row.deactivated_at).toBeNull();
    expect(row.created_at).toBeInstanceOf(Date);
    expect(row.updated_at).toBeInstanceOf(Date);
  });

  it("round-trips a fully populated team", async () => {
    const department = await insertDepartment();
    const manager = await insertUser("team.manager@team.test");
    const row = await insertTeam(department.id, "Production", {
      description: "Owns production delivery.",
      manager_id: manager.id,
    });

    expect(row).toMatchObject({
      name: "Production",
      department_id: department.id,
      description: "Owns production delivery.",
      manager_id: manager.id,
    });
  });

  describe("name uniqueness is per department", () => {
    it("rejects a duplicate team name inside one department", async () => {
      const department = await insertDepartment();
      await insertTeam(department.id, "Marketing");

      await expect(
        insertTeam(department.id, "Marketing"),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });

    it("allows the same team name in a different department", async () => {
      const first = await insertDepartment();
      const second = await insertDepartment();
      await insertTeam(first.id, "Design");

      await expect(insertTeam(second.id, "Design")).resolves.toMatchObject({
        name: "Design",
      });
    });

    it("treats team names as case-sensitive at the database", async () => {
      const department = await insertDepartment();
      await insertTeam(department.id, "Creative Team");

      await expect(
        insertTeam(department.id, "creative team"),
      ).resolves.toMatchObject({ name: "creative team" });
    });
  });

  describe("text invariants", () => {
    it("rejects a blank or whitespace-only name", async () => {
      const department = await insertDepartment();

      await expect(insertTeam(department.id, "")).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
      await expect(insertTeam(department.id, "   ")).rejects.toMatchObject({
        code: PG_ERROR.checkViolation,
      });
    });

    it("rejects a blank description but allows null", async () => {
      const department = await insertDepartment();

      await expect(
        insertTeam(department.id, unique("Team"), { description: "  " }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        insertTeam(department.id, unique("Team"), { description: null }),
      ).resolves.toMatchObject({ description: null });
    });
  });

  describe("department ownership", () => {
    it("requires a department id", async () => {
      await expect(
        db.query(`INSERT INTO teams (name) VALUES ($1)`, [unique("Team")]),
      ).rejects.toMatchObject({ code: PG_ERROR.notNullViolation });
    });

    it("rejects a department id that is not a real department", async () => {
      await expect(
        insertTeam(MISSING_UUID, unique("Team")),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });

    it("refuses to delete a department that still owns a team", async () => {
      const department = await insertDepartment();
      const team = await insertTeam(department.id, "Anchored");

      // `ON DELETE RESTRICT` raises its own SQLSTATE, distinct from the
      // plain foreign-key-violation code used for a bad reference on insert.
      await expect(
        db.query(`DELETE FROM departments WHERE id = $1`, [department.id]),
      ).rejects.toMatchObject({ code: PG_ERROR.restrictViolation });

      const [survivor] = await db.query<{ id: string }>(
        `SELECT id FROM teams WHERE id = $1`,
        [team.id],
      );
      expect(survivor?.id).toBe(team.id);
    });
  });

  describe("manager slot", () => {
    it("rejects a manager id that is not a real user", async () => {
      const department = await insertDepartment();

      await expect(
        insertTeam(department.id, unique("Team"), { manager_id: MISSING_UUID }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });

    it("clears the manager slot when the manager user is removed", async () => {
      const department = await insertDepartment();
      const manager = await insertUser("leaving.lead@team.test");
      const team = await insertTeam(department.id, "Promotion", {
        manager_id: manager.id,
      });

      await db.query(`DELETE FROM users WHERE id = $1`, [manager.id]);

      const [row] = await db.query<{ manager_id: string | null }>(
        `SELECT manager_id FROM teams WHERE id = $1`,
        [team.id],
      );
      expect(row?.manager_id).toBeNull();
    });
  });

  it("allows a deactivate then reactivate cycle on the timestamp marker", async () => {
    const department = await insertDepartment();
    const team = await insertTeam(department.id, "Cycled");

    await db.query(`UPDATE teams SET deactivated_at = now() WHERE id = $1`, [
      team.id,
    ]);
    let [row] = await db.query<{ deactivated_at: Date | null }>(
      `SELECT deactivated_at FROM teams WHERE id = $1`,
      [team.id],
    );
    expect(row?.deactivated_at).toBeInstanceOf(Date);

    await db.query(`UPDATE teams SET deactivated_at = NULL WHERE id = $1`, [
      team.id,
    ]);
    [row] = await db.query<{ deactivated_at: Date | null }>(
      `SELECT deactivated_at FROM teams WHERE id = $1`,
      [team.id],
    );
    expect(row?.deactivated_at).toBeNull();
  });

  describe("membership", () => {
    async function addMember(teamId: string, userId: string): Promise<void> {
      await db.query(
        `INSERT INTO team_memberships (team_id, user_id) VALUES ($1, $2)`,
        [teamId, userId],
      );
    }

    it("links a user to a team and reads it back", async () => {
      const department = await insertDepartment();
      const team = await insertTeam(department.id, unique("Team"));
      const user = await insertUser();

      await addMember(team.id, user.id);

      const [row] = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM team_memberships WHERE team_id = $1`,
        [team.id],
      );
      expect(row?.count).toBe("1");
    });

    it("rejects the same user in the same team twice", async () => {
      const department = await insertDepartment();
      const team = await insertTeam(department.id, unique("Team"));
      const user = await insertUser();
      await addMember(team.id, user.id);

      await expect(addMember(team.id, user.id)).rejects.toMatchObject({
        code: PG_ERROR.uniqueViolation,
      });
    });

    it("lets one user belong to several teams", async () => {
      const department = await insertDepartment();
      const first = await insertTeam(department.id, unique("Team"));
      const second = await insertTeam(department.id, unique("Team"));
      const user = await insertUser();

      await addMember(first.id, user.id);
      await addMember(second.id, user.id);

      const [row] = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM team_memberships WHERE user_id = $1`,
        [user.id],
      );
      expect(row?.count).toBe("2");
    });

    it("rejects membership rows that point at nothing", async () => {
      const department = await insertDepartment();
      const team = await insertTeam(department.id, unique("Team"));
      const user = await insertUser();

      await expect(addMember(MISSING_UUID, user.id)).rejects.toMatchObject({
        code: PG_ERROR.foreignKeyViolation,
      });
      await expect(addMember(team.id, MISSING_UUID)).rejects.toMatchObject({
        code: PG_ERROR.foreignKeyViolation,
      });
    });

    it("drops membership rows when the team is deleted", async () => {
      const department = await insertDepartment();
      const team = await insertTeam(department.id, unique("Team"));
      const user = await insertUser();
      await addMember(team.id, user.id);

      await db.query(`DELETE FROM teams WHERE id = $1`, [team.id]);

      const [membership] = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM team_memberships WHERE user_id = $1`,
        [user.id],
      );
      expect(membership?.count).toBe("0");
      const [survivor] = await db.query<{ id: string }>(
        `SELECT id FROM users WHERE id = $1`,
        [user.id],
      );
      expect(survivor?.id).toBe(user.id);
    });

    it("drops membership rows when the user is deleted", async () => {
      const department = await insertDepartment();
      const team = await insertTeam(department.id, unique("Team"));
      const user = await insertUser();
      await addMember(team.id, user.id);

      await db.query(`DELETE FROM users WHERE id = $1`, [user.id]);

      const [membership] = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM team_memberships WHERE team_id = $1`,
        [team.id],
      );
      expect(membership?.count).toBe("0");
      const [survivor] = await db.query<{ id: string }>(
        `SELECT id FROM teams WHERE id = $1`,
        [team.id],
      );
      expect(survivor?.id).toBe(team.id);
    });
  });

  it("reports every committed migration as applied", async () => {
    const [row] = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    expect(Number(row!.count)).toBeGreaterThanOrEqual(7);
  });
});
