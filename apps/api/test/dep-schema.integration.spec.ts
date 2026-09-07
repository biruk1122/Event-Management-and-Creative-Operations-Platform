import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

describe("department management schema", () => {
  let db: IsolatedDatabase;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
  });

  afterAll(async () => {
    await db?.drop();
  });

  async function insertDepartment(
    name: string,
    columns: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const keys = ["name", ...Object.keys(columns)];
    const values = [name, ...Object.values(columns)];
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query(
      `INSERT INTO departments (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
    return row!;
  }

  async function insertUser(
    email: string,
    columns: Record<string, unknown> = {},
  ): Promise<{ id: string }> {
    const keys = ["email", ...Object.keys(columns)];
    const values = [email, ...Object.values(columns)];
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO users (${keys.join(", ")}) VALUES (${placeholders}) RETURNING id`,
      values,
    );
    return row!;
  }

  it("creates a department with server defaults", async () => {
    const row = await insertDepartment("Event Management");

    expect(row.id).toEqual(expect.any(String));
    expect(row.description).toBeNull();
    expect(row.manager_id).toBeNull();
    expect(row.deactivated_at).toBeNull();
    expect(row.created_at).toBeInstanceOf(Date);
    expect(row.updated_at).toBeInstanceOf(Date);
  });

  it("round-trips a fully populated department", async () => {
    const manager = await insertUser("dept.manager@dep.test");
    const row = await insertDepartment("Production", {
      description: "Owns production planning and delivery.",
      manager_id: manager.id,
    });

    expect(row).toMatchObject({
      name: "Production",
      description: "Owns production planning and delivery.",
      manager_id: manager.id,
    });
  });

  it("rejects a duplicate department name", async () => {
    await insertDepartment("Marketing");
    await expect(insertDepartment("Marketing")).rejects.toMatchObject({
      code: PG_ERROR.uniqueViolation,
    });
  });

  it("treats department names as case-sensitive at the database", async () => {
    await insertDepartment("Creative Department");
    await expect(
      insertDepartment("creative department"),
    ).resolves.toMatchObject({ name: "creative department" });
  });

  it("rejects a blank or whitespace-only name", async () => {
    await expect(insertDepartment("")).rejects.toMatchObject({
      code: PG_ERROR.checkViolation,
    });
    await expect(insertDepartment("   ")).rejects.toMatchObject({
      code: PG_ERROR.checkViolation,
    });
  });

  it("rejects a blank description but allows null", async () => {
    await expect(
      insertDepartment("Blank Desc", { description: "  " }),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await expect(
      insertDepartment("Null Desc", { description: null }),
    ).resolves.toMatchObject({ description: null });
  });

  it("rejects a manager id that is not a real user", async () => {
    await expect(
      insertDepartment("Bad Manager", {
        manager_id: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
  });

  it("clears the manager slot when the manager user is removed", async () => {
    const manager = await insertUser("leaving.manager@dep.test");
    const dept = await insertDepartment("Promotion", {
      manager_id: manager.id,
    });

    await db.query(`DELETE FROM users WHERE id = $1`, [manager.id]);

    const [row] = await db.query<{ manager_id: string | null }>(
      `SELECT manager_id FROM departments WHERE id = $1`,
      [dept.id],
    );
    expect(row?.manager_id).toBeNull();
  });

  describe("employee assignment", () => {
    it("defaults a user's department to null", async () => {
      const [row] = await db.query<{ department_id: string | null }>(
        `SELECT department_id FROM users WHERE id = $1`,
        [(await insertUser("unassigned@dep.test")).id],
      );
      expect(row?.department_id).toBeNull();
    });

    it("rejects a department id that is not a real department", async () => {
      await expect(
        insertUser("bad.dept@dep.test", {
          department_id: "00000000-0000-0000-0000-000000000000",
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });

    it("links employees and reads them back through the department", async () => {
      const dept = await insertDepartment("Talent Management");
      await insertUser("emp.one@dep.test", { department_id: dept.id });
      await insertUser("emp.two@dep.test", { department_id: dept.id });

      const [row] = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM users WHERE department_id = $1`,
        [dept.id],
      );
      expect(row?.count).toBe("2");
    });

    it("unassigns employees instead of deleting them when the department is removed", async () => {
      const dept = await insertDepartment("Temporary Unit");
      const employee = await insertUser("kept.employee@dep.test", {
        department_id: dept.id,
      });

      await db.query(`DELETE FROM departments WHERE id = $1`, [dept.id]);

      const [row] = await db.query<{ department_id: string | null }>(
        `SELECT department_id FROM users WHERE id = $1`,
        [employee.id],
      );
      expect(row?.department_id).toBeNull();
    });
  });

  it("allows a deactivate then reactivate cycle on the timestamp marker", async () => {
    const dept = await insertDepartment("Cycled Department");

    await db.query(
      `UPDATE departments SET deactivated_at = now() WHERE id = $1`,
      [dept.id],
    );
    let [row] = await db.query<{ deactivated_at: Date | null }>(
      `SELECT deactivated_at FROM departments WHERE id = $1`,
      [dept.id],
    );
    expect(row?.deactivated_at).toBeInstanceOf(Date);

    await db.query(
      `UPDATE departments SET deactivated_at = NULL WHERE id = $1`,
      [dept.id],
    );
    [row] = await db.query<{ deactivated_at: Date | null }>(
      `SELECT deactivated_at FROM departments WHERE id = $1`,
      [dept.id],
    );
    expect(row?.deactivated_at).toBeNull();
  });

  it("reports every committed migration as applied", async () => {
    const [row] = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    expect(Number(row!.count)).toBeGreaterThanOrEqual(6);
  });
});
