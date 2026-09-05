import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../src/generated/prisma/client.js";
import {
  BASELINE_GRANTS,
  PERMISSIONS,
  ROLE_DEFINITIONS,
} from "../src/rbac/rbac-catalog.js";
import { seedRbac } from "../src/rbac/seed-rbac.js";
import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

function prismaFor(db: IsolatedDatabase): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: db.url }, { schema: db.schema }),
  });
}

describe("configurable roles and permissions constraints", () => {
  let db: IsolatedDatabase;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
  });

  afterAll(async () => {
    await db?.drop();
  });

  async function insertPermission(key: string): Promise<unknown[]> {
    return db.query(
      `INSERT INTO permissions (key, description) VALUES ($1, 'test')`,
      [key],
    );
  }

  async function insertRole(name: string): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO roles (name, description) VALUES ($1, 'test') RETURNING id`,
      [name],
    );
    return row!.id;
  }

  it("rejects a permission key that is not dot-separated lower-case", async () => {
    await expect(insertPermission("NotValid")).rejects.toMatchObject({
      code: PG_ERROR.checkViolation,
    });
    await expect(insertPermission("task.")).rejects.toMatchObject({
      code: PG_ERROR.checkViolation,
    });
  });

  it("accepts a three-segment permission key", async () => {
    await expect(insertPermission("a.b.c")).resolves.toEqual([]);
  });

  it("rejects a duplicate permission key", async () => {
    await insertPermission("dup.key");
    await expect(insertPermission("dup.key")).rejects.toMatchObject({
      code: PG_ERROR.uniqueViolation,
    });
  });

  it("rejects a duplicate role name", async () => {
    await insertRole("Duplicate Role");
    await expect(insertRole("Duplicate Role")).rejects.toMatchObject({
      code: PG_ERROR.uniqueViolation,
    });
  });

  it("requires a role_permissions row to reference an existing role and permission", async () => {
    const permissionKey = "orphan.role.permission";
    await insertPermission(permissionKey);

    await expect(
      db.query(
        `INSERT INTO role_permissions (role_id, permission_key, scope)
         VALUES (gen_random_uuid(), $1, 'ORGANIZATION')`,
        [permissionKey],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });

    const roleId = await insertRole("Orphan Permission Role");
    await expect(
      db.query(
        `INSERT INTO role_permissions (role_id, permission_key, scope)
         VALUES ($1, 'does.not.exist', 'ORGANIZATION')`,
        [roleId],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
  });

  it("rejects the same grant triple twice but allows a different scope", async () => {
    const permissionKey = "grant.triple.permission";
    await insertPermission(permissionKey);
    const roleId = await insertRole("Grant Triple Role");

    await db.query(
      `INSERT INTO role_permissions (role_id, permission_key, scope)
       VALUES ($1, $2, 'ORGANIZATION')`,
      [roleId, permissionKey],
    );

    await expect(
      db.query(
        `INSERT INTO role_permissions (role_id, permission_key, scope)
         VALUES ($1, $2, 'ORGANIZATION')`,
        [roleId, permissionKey],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });

    await expect(
      db.query(
        `INSERT INTO role_permissions (role_id, permission_key, scope)
         VALUES ($1, $2, 'SELF')`,
        [roleId, permissionKey],
      ),
    ).resolves.toEqual([]);
  });

  it("requires a baseline_grants row to reference an existing permission and rejects a duplicate", async () => {
    await expect(
      db.query(
        `INSERT INTO baseline_grants (permission_key, scope) VALUES ('does.not.exist', 'SELF')`,
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });

    const permissionKey = "baseline.duplicate.permission";
    await insertPermission(permissionKey);
    await db.query(
      `INSERT INTO baseline_grants (permission_key, scope) VALUES ($1, 'SELF')`,
      [permissionKey],
    );
    await expect(
      db.query(
        `INSERT INTO baseline_grants (permission_key, scope) VALUES ($1, 'SELF')`,
        [permissionKey],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
  });

  it("cascades role_permissions deletion when the role is removed", async () => {
    const permissionKey = "cascade.role.permission";
    await insertPermission(permissionKey);
    const roleId = await insertRole("Cascade Role");
    await db.query(
      `INSERT INTO role_permissions (role_id, permission_key, scope)
       VALUES ($1, $2, 'ORGANIZATION')`,
      [roleId, permissionKey],
    );

    await db.query(`DELETE FROM roles WHERE id = $1`, [roleId]);

    const [remaining] = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM role_permissions WHERE role_id = $1`,
      [roleId],
    );
    expect(remaining!.count).toBe("0");
  });

  it("cascades role_permissions and baseline_grants deletion when the permission is removed", async () => {
    const permissionKey = "cascade.permission.deletion";
    await insertPermission(permissionKey);
    const roleId = await insertRole("Cascade Permission Role");
    await db.query(
      `INSERT INTO role_permissions (role_id, permission_key, scope)
       VALUES ($1, $2, 'ORGANIZATION')`,
      [roleId, permissionKey],
    );
    await db.query(
      `INSERT INTO baseline_grants (permission_key, scope) VALUES ($1, 'SELF')`,
      [permissionKey],
    );

    await db.query(`DELETE FROM permissions WHERE key = $1`, [permissionKey]);

    const [rolePermissions] = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM role_permissions WHERE permission_key = $1`,
      [permissionKey],
    );
    const [baselineGrants] = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM baseline_grants WHERE permission_key = $1`,
      [permissionKey],
    );
    expect(rolePermissions!.count).toBe("0");
    expect(baselineGrants!.count).toBe("0");
  });

  it("reports the migration as applied", async () => {
    const [row] = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    expect(Number(row!.count)).toBeGreaterThanOrEqual(3);
  });
});

describe("seeding the permission catalog and role matrix", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;

  const totalRolePermissions = ROLE_DEFINITIONS.reduce(
    (sum, role) => sum + role.grants.length,
    0,
  );

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    prisma = prismaFor(db);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  it("creates every permission, role, grant, and baseline grant", async () => {
    const result = await seedRbac(prisma);

    expect(result).toEqual({
      permissions: PERMISSIONS.length,
      roles: ROLE_DEFINITIONS.length,
      rolePermissions: totalRolePermissions,
      baselineGrants: BASELINE_GRANTS.length,
    });

    await expect(prisma.permission.count()).resolves.toBe(PERMISSIONS.length);
    await expect(prisma.role.count()).resolves.toBe(ROLE_DEFINITIONS.length);
    await expect(prisma.rolePermission.count()).resolves.toBe(
      totalRolePermissions,
    );
    await expect(prisma.baselineGrant.count()).resolves.toBe(
      BASELINE_GRANTS.length,
    );
  });

  it("is idempotent: seeding again does not change any row count", async () => {
    await seedRbac(prisma);

    await expect(prisma.permission.count()).resolves.toBe(PERMISSIONS.length);
    await expect(prisma.role.count()).resolves.toBe(ROLE_DEFINITIONS.length);
    await expect(prisma.rolePermission.count()).resolves.toBe(
      totalRolePermissions,
    );
    await expect(prisma.baselineGrant.count()).resolves.toBe(
      BASELINE_GRANTS.length,
    );
  });

  it("seeds every role as a system role with only its own grants", async () => {
    const superAdmin = await prisma.role.findUniqueOrThrow({
      where: { name: "Super Admin" },
      include: { rolePermissions: true },
    });
    expect(superAdmin.isSystem).toBe(true);
    expect(superAdmin.rolePermissions).toHaveLength(PERMISSIONS.length);
    expect(
      superAdmin.rolePermissions.every(
        (grant) => grant.scope === "ORGANIZATION",
      ),
    ).toBe(true);

    const teamMember = await prisma.role.findUniqueOrThrow({
      where: { name: "Team Member" },
      include: { rolePermissions: true },
    });
    expect(teamMember.rolePermissions).toHaveLength(10);
    expect(
      teamMember.rolePermissions.some(
        (grant) =>
          grant.permissionKey === "task.read" && grant.scope === "ORGANIZATION",
      ),
    ).toBe(false);
    expect(
      teamMember.rolePermissions.some(
        (grant) =>
          grant.permissionKey === "task.read" && grant.scope === "SELF",
      ),
    ).toBe(true);
    // A Team Member holds no grant for any sensitive-management key.
    expect(
      teamMember.rolePermissions.some((grant) =>
        ["user.read", "role.read", "settings.read", "audit.read"].includes(
          grant.permissionKey,
        ),
      ),
    ).toBe(false);
  });

  it("seeds the baseline grants independent of any role", async () => {
    const baseline = await prisma.baselineGrant.findMany();
    expect(baseline).toHaveLength(BASELINE_GRANTS.length);
    expect(
      baseline.some(
        (grant) =>
          grant.permissionKey === "directory.read" &&
          grant.scope === "ORGANIZATION",
      ),
    ).toBe(true);
    expect(
      baseline.every(
        (grant) =>
          grant.permissionKey === "directory.read" || grant.scope === "SELF",
      ),
    ).toBe(true);
  });
});
