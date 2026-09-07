import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

describe("user and profile administration schema", () => {
  let db: IsolatedDatabase;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
  });

  afterAll(async () => {
    await db?.drop();
  });

  async function insertUser(
    email: string,
    columns: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const keys = ["email", ...Object.keys(columns)];
    const values = [email, ...Object.values(columns)];
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query(
      `INSERT INTO users (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
    return row!;
  }

  it("adds the profile columns as nullable, defaulting to null", async () => {
    const row = await insertUser("defaults@usr.test");

    expect(row.first_name).toBeNull();
    expect(row.last_name).toBeNull();
    expect(row.phone).toBeNull();
    expect(row.profile_image).toBeNull();
    expect(row.deactivated_at).toBeNull();
    expect(row.status).toBe("ACTIVE");
  });

  it("keeps the email-only insert path working for existing fixtures", async () => {
    await expect(insertUser("email-only@usr.test")).resolves.toBeDefined();
  });

  it("round-trips a fully populated profile", async () => {
    const row = await insertUser("full@usr.test", {
      first_name: "Ada",
      last_name: "Lovelace",
      phone: "+1 (555) 010-2030",
      profile_image: "avatars/ada.png",
    });

    expect(row).toMatchObject({
      first_name: "Ada",
      last_name: "Lovelace",
      phone: "+1 (555) 010-2030",
      profile_image: "avatars/ada.png",
    });
  });

  it.each([["first_name"], ["last_name"], ["phone"], ["profile_image"]])(
    "rejects a blank or whitespace-only %s",
    async (column) => {
      await expect(
        insertUser(`blank-${column}@usr.test`, { [column]: "" }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
      await expect(
        insertUser(`spaces-${column}@usr.test`, { [column]: "   " }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    },
  );

  describe("deactivation timestamp stays in step with status", () => {
    it("rejects INACTIVE without a deactivation timestamp", async () => {
      await expect(
        insertUser("inactive-no-ts@usr.test", { status: "INACTIVE" }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("rejects ACTIVE carrying a deactivation timestamp", async () => {
      await expect(
        insertUser("active-with-ts@usr.test", {
          deactivated_at: new Date().toISOString(),
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("accepts a coherent INACTIVE row", async () => {
      await expect(
        insertUser("inactive-ok@usr.test", {
          status: "INACTIVE",
          deactivated_at: new Date().toISOString(),
        }),
      ).resolves.toMatchObject({ status: "INACTIVE" });
    });

    it("rejects a status change to INACTIVE that leaves the timestamp null", async () => {
      const user = await insertUser("deactivate-update@usr.test");
      await expect(
        db.query(`UPDATE users SET status = 'INACTIVE' WHERE id = $1`, [
          user.id,
        ]),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("allows a full deactivate then reactivate cycle", async () => {
      const user = await insertUser("cycle@usr.test");

      await db.query(
        `UPDATE users SET status = 'INACTIVE', deactivated_at = now() WHERE id = $1`,
        [user.id],
      );
      await db.query(
        `UPDATE users SET status = 'ACTIVE', deactivated_at = NULL WHERE id = $1`,
        [user.id],
      );

      const [row] = await db.query<{
        status: string;
        deactivated_at: string | null;
      }>(`SELECT status, deactivated_at FROM users WHERE id = $1`, [user.id]);
      expect(row).toEqual({ status: "ACTIVE", deactivated_at: null });
    });
  });

  describe("credential initial-password flag", () => {
    async function insertCredential(
      email: string,
      mustChange?: boolean,
    ): Promise<Record<string, unknown>> {
      const user = await insertUser(email);
      const columns =
        mustChange === undefined
          ? ["user_id", "password_hash"]
          : ["user_id", "password_hash", "must_change_password"];
      const values =
        mustChange === undefined
          ? [user.id, "argon2id$hash"]
          : [user.id, "argon2id$hash", mustChange];
      const [row] = await db.query(
        `INSERT INTO user_credentials (${columns.join(", ")})
         VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`,
        values,
      );
      return row!;
    }

    it("defaults must_change_password to false", async () => {
      const row = await insertCredential("cred-default@usr.test");
      expect(row.must_change_password).toBe(false);
    });

    it("stores an operator-set credential that must be rotated", async () => {
      const row = await insertCredential("cred-temp@usr.test", true);
      expect(row.must_change_password).toBe(true);
    });
  });

  it("still cascades credentials and role assignments when the user is deleted", async () => {
    const user = await insertUser("cascade@usr.test");
    await db.query(
      `INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`,
      [user.id, "argon2id$hash"],
    );
    const [role] = await db.query<{ id: string }>(
      `INSERT INTO roles (name, description) VALUES ('Cascade USR Role', 'test') RETURNING id`,
    );
    await db.query(
      `INSERT INTO user_role_assignments (user_id, role_id) VALUES ($1, $2)`,
      [user.id, role!.id],
    );

    await db.query(`DELETE FROM users WHERE id = $1`, [user.id]);

    const [credentials] = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM user_credentials WHERE user_id = $1`,
      [user.id],
    );
    const [assignments] = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM user_role_assignments WHERE user_id = $1`,
      [user.id],
    );
    expect(credentials!.count).toBe("0");
    expect(assignments!.count).toBe("0");
  });

  it("reports every committed migration as applied", async () => {
    const [row] = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    expect(Number(row!.count)).toBeGreaterThanOrEqual(5);
  });
});
