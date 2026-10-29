import { execSync } from "node:child_process";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

describe("employee management schema", () => {
  let db: IsolatedDatabase;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
  });
  afterAll(async () => {
    await db?.drop();
  });

  async function insertUser(email: string): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      "INSERT INTO users (email) VALUES ($1) RETURNING id",
      [email],
    );
    return row!.id;
  }

  async function insertEmployee(
    userId: string,
    employeeCode: string,
    columns: Record<string, unknown> = {},
  ): Promise<string> {
    const base = {
      user_id: userId,
      employee_code: employeeCode,
      position: "Coordinator",
      employment_type: "FULL_TIME",
      employment_date: "2026-01-01",
      ...columns,
    };
    const keys = Object.keys(base);
    const values = Object.values(base);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO employee_profiles (${keys.join(", ")}) VALUES (${placeholders}) RETURNING id`,
      values,
    );
    return row!.id;
  }

  it("applies all migrations to a clean PostgreSQL schema", () => {
    const output = execSync("pnpm exec prisma migrate status", {
      cwd: resolve(import.meta.dirname, ".."),
      env: { ...process.env, DATABASE_URL: db.url },
      encoding: "utf8",
    });
    expect(output).toContain("Database schema is up to date");
  });

  it("stores an employee profile with the right defaults", async () => {
    const userId = await insertUser("ada@emp.test");
    const id = await insertEmployee(userId, "EMP-0001");
    const [row] = await db.query<{
      employment_status: string;
      reporting_manager_id: string | null;
      base_salary: string | null;
      currency: string | null;
      status_changed_at: string | null;
      bank_account_number: string | null;
    }>("SELECT * FROM employee_profiles WHERE id = $1", [id]);
    expect(row!.employment_status).toBe("ACTIVE");
    expect(row!.reporting_manager_id).toBeNull();
    expect(row!.base_salary).toBeNull();
    expect(row!.currency).toBeNull();
    expect(row!.status_changed_at).toBeNull();
    expect(row!.bank_account_number).toBeNull();
  });

  it("stores a payroll bank account number", async () => {
    const userId = await insertUser("bank@emp.test");
    const id = await insertEmployee(userId, "EMP-0002", {
      bank_account_number: "1000200030004000",
    });
    const [row] = await db.query<{ bank_account_number: string | null }>(
      "SELECT bank_account_number FROM employee_profiles WHERE id = $1",
      [id],
    );
    expect(row!.bank_account_number).toBe("1000200030004000");
  });

  it("enforces one employee profile per user and a unique employee code", async () => {
    const userA = await insertUser("a@emp.test");
    const userB = await insertUser("b@emp.test");
    await insertEmployee(userA, "EMP-0010");
    await expect(insertEmployee(userA, "EMP-0011")).rejects.toMatchObject({
      code: PG_ERROR.uniqueViolation,
    });
    await expect(insertEmployee(userB, "EMP-0010")).rejects.toMatchObject({
      code: PG_ERROR.uniqueViolation,
    });
  });

  it("rejects a blank employee code or position", async () => {
    const userId = await insertUser("blank@emp.test");
    await expect(insertEmployee(userId, "   ")).rejects.toMatchObject({
      code: PG_ERROR.checkViolation,
    });
    const userId2 = await insertUser("blank2@emp.test");
    await expect(
      insertEmployee(userId2, "EMP-0020", { position: "  " }),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
  });

  it("requires compensation amounts and currency together, non-negative, ISO-4217", async () => {
    const amountOnly = await insertUser("amount-only@emp.test");
    await expect(
      insertEmployee(amountOnly, "EMP-0030", { base_salary: "25000.00" }),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });

    const currencyOnly = await insertUser("currency-only@emp.test");
    await expect(
      insertEmployee(currencyOnly, "EMP-0031", { currency: "ETB" }),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });

    const negative = await insertUser("negative@emp.test");
    await expect(
      insertEmployee(negative, "EMP-0032", {
        base_salary: "-1.00",
        currency: "ETB",
      }),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });

    const badCurrency = await insertUser("bad-currency@emp.test");
    await expect(
      insertEmployee(badCurrency, "EMP-0033", {
        base_salary: "100.00",
        currency: "etb",
      }),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });

    const happy = await insertUser("happy@emp.test");
    const id = await insertEmployee(happy, "EMP-0034", {
      base_salary: "25000.00",
      allowance_amount: "1500.00",
      currency: "ETB",
    });
    const [row] = await db.query<{
      base_salary: string;
      allowance_amount: string;
    }>(
      "SELECT base_salary, allowance_amount FROM employee_profiles WHERE id = $1",
      [id],
    );
    expect(row!.base_salary).toBe("25000.00");
    expect(row!.allowance_amount).toBe("1500.00");
  });

  it("rejects an employee reporting to themselves", async () => {
    const userId = await insertUser("self-manage@emp.test");
    const id = await insertEmployee(userId, "EMP-0040");
    await expect(
      db.query(
        "UPDATE employee_profiles SET reporting_manager_id = $1 WHERE id = $2",
        [userId, id],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
  });

  it("requires a status-change timestamp and actor together", async () => {
    const actor = await insertUser("actor@emp.test");
    const userId = await insertUser("status-change@emp.test");
    const id = await insertEmployee(userId, "EMP-0050");
    await expect(
      db.query(
        "UPDATE employee_profiles SET status_changed_at = now() WHERE id = $1",
        [id],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await expect(
      db.query(
        "UPDATE employee_profiles SET status_changed_by_id = $1 WHERE id = $2",
        [actor, id],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await db.query(
      `UPDATE employee_profiles
       SET employment_status = 'INACTIVE', status_changed_at = now(), status_changed_by_id = $1
       WHERE id = $2`,
      [actor, id],
    );
    const [row] = await db.query<{ status_changed_by_id: string }>(
      "SELECT status_changed_by_id FROM employee_profiles WHERE id = $1",
      [id],
    );
    expect(row!.status_changed_by_id).toBe(actor);
  });

  it("removes the employee profile when the linked user is deleted, but clears (not deletes) a reporting manager reference", async () => {
    const managerId = await insertUser("manager@emp.test");
    const reportId = await insertUser("report@emp.test");
    const managerProfile = await insertEmployee(managerId, "EMP-0060");
    const reportProfile = await insertEmployee(reportId, "EMP-0061", {
      reporting_manager_id: managerId,
    });

    await db.query("DELETE FROM users WHERE id = $1", [managerId]);

    expect(
      await db.query("SELECT 1 FROM employee_profiles WHERE id = $1", [
        managerProfile,
      ]),
    ).toHaveLength(0);
    const [row] = await db.query<{ reporting_manager_id: string | null }>(
      "SELECT reporting_manager_id FROM employee_profiles WHERE id = $1",
      [reportProfile],
    );
    expect(row!.reporting_manager_id).toBeNull();
  });

  it("rejects an unknown employment type, status, or gender", async () => {
    const userId = await insertUser("enum@emp.test");
    await expect(
      insertEmployee(userId, "EMP-0070", { employment_type: "FREELANCE" }),
    ).rejects.toMatchObject({ code: PG_ERROR.invalidTextRepresentation });
    const userId2 = await insertUser("enum2@emp.test");
    await expect(
      insertEmployee(userId2, "EMP-0071", { employment_status: "RETIRED" }),
    ).rejects.toMatchObject({ code: PG_ERROR.invalidTextRepresentation });
    const userId3 = await insertUser("enum3@emp.test");
    await expect(
      insertEmployee(userId3, "EMP-0072", { gender: "UNSPECIFIED" }),
    ).rejects.toMatchObject({ code: PG_ERROR.invalidTextRepresentation });
  });
});
