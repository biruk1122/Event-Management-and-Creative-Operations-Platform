import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";
import { PLATFORM_DEPARTMENTS } from "../src/common/security/department-access.policy.js";
import { ROLE_DEFINITIONS } from "../src/rbac/rbac-catalog.js";

describe("department RBAC catalog migration", () => {
  let db: IsolatedDatabase;
  beforeAll(async () => {
    db = await createIsolatedDatabase({ preserveMigrationData: true });
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("creates the four approved departments with the requested casing", async () => {
    const rows = await db.query<{ name: string }>(
      "SELECT name FROM departments ORDER BY name",
    );
    expect(rows.map((row) => row.name)).toEqual(
      [...PLATFORM_DEPARTMENTS].sort(),
    );
    expect(ROLE_DEFINITIONS.map((role) => role.name)).toEqual([
      "Super Admin",
      "Department Manager",
      "Department Member",
    ]);
  });

  it("preserves existing role assignments and account ids while renaming a legacy member", async () => {
    const [role] = await db.query<{ id: string }>(
      "INSERT INTO roles (name, is_system, updated_at) VALUES ('Team Member', TRUE, NOW()) RETURNING id",
    );
    const [user] = await db.query<{ id: string }>(
      "INSERT INTO users (email, updated_at) VALUES ('legacy-member@example.test', NOW()) RETURNING id",
    );
    await db.query(
      "INSERT INTO user_role_assignments (user_id, role_id, updated_at) VALUES ($1, $2, NOW())",
      [user!.id, role!.id],
    );
    const migration = await readFile(
      new URL(
        "../prisma/migrations/20261013120000_department_rbac_catalog/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.query(migration);
    const rows = await db.query<{ id: string; name: string }>(
      "SELECT u.id, r.name FROM users u JOIN user_role_assignments a ON a.user_id = u.id JOIN roles r ON r.id = a.role_id WHERE u.id = $1",
      [user!.id],
    );
    expect(rows).toEqual([{ id: user!.id, name: "Department Member" }]);
  });

  it("preserves Super Admin while removing only unused obsolete roles", async () => {
    const [adminRole] = await db.query<{ id: string }>(
      "INSERT INTO roles (name, is_system, updated_at) VALUES ('Super Admin', TRUE, NOW()) RETURNING id",
    );
    const [admin] = await db.query<{ id: string }>(
      "INSERT INTO users (email, updated_at) VALUES ('preserved-admin@example.test', NOW()) RETURNING id",
    );
    await db.query(
      "INSERT INTO user_role_assignments (user_id, role_id, updated_at) VALUES ($1, $2, NOW())",
      [admin!.id, adminRole!.id],
    );
    await db.query(
      "INSERT INTO roles (name, is_system, updated_at) VALUES ('Management/Administrator', TRUE, NOW())",
    );
    const migration = await readFile(
      new URL(
        "../prisma/migrations/20261013120000_department_rbac_catalog/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.query(migration);
    expect(
      await db.query("SELECT id FROM users WHERE id = $1", [admin!.id]),
    ).toEqual([{ id: admin!.id }]);
    expect(
      await db.query(
        "SELECT user_id FROM user_role_assignments WHERE user_id = $1 AND role_id = $2",
        [admin!.id, adminRole!.id],
      ),
    ).toEqual([{ user_id: admin!.id }]);
    expect(
      await db.query(
        "SELECT id FROM roles WHERE name = 'Management/Administrator'",
      ),
    ).toEqual([]);
  });
});
