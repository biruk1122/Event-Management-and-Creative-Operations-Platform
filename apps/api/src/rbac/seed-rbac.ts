import type { PrismaClient } from "../generated/prisma/client.js";
import {
  BASELINE_GRANTS,
  PERMISSIONS,
  ROLE_DEFINITIONS,
} from "./rbac-catalog.js";

/** The subset of the Prisma client `seedRbac` needs - satisfied by a full
 * `PrismaClient` or by the `tx` passed into `$transaction`. */
export type RbacSeedClient = Pick<
  PrismaClient,
  "permission" | "role" | "rolePermission" | "baselineGrant"
>;

export interface RbacSeedResult {
  permissions: number;
  roles: number;
  rolePermissions: number;
  baselineGrants: number;
}

/**
 * Idempotently seed the permission catalog, the five SRS roles and their
 * grants, and the baseline grants from `rbac-catalog.ts`. Every write is an
 * upsert keyed on the row's natural identity, so running this repeatedly
 * against the same database converges on the same rows instead of erroring
 * or duplicating them.
 */
export async function seedRbac(
  prisma: RbacSeedClient,
): Promise<RbacSeedResult> {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      create: permission,
      update: { description: permission.description },
    });
  }

  for (const grant of BASELINE_GRANTS) {
    await prisma.baselineGrant.upsert({
      where: {
        permissionKey_scope: {
          permissionKey: grant.permissionKey,
          scope: grant.scope,
        },
      },
      create: grant,
      update: {},
    });
  }

  let rolePermissions = 0;
  for (const role of ROLE_DEFINITIONS) {
    const record = await prisma.role.upsert({
      where: { name: role.name },
      create: {
        name: role.name,
        description: role.description,
        isSystem: true,
      },
      update: { description: role.description, isSystem: true },
    });

    for (const grant of role.grants) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionKey_scope: {
            roleId: record.id,
            permissionKey: grant.permissionKey,
            scope: grant.scope,
          },
        },
        create: {
          roleId: record.id,
          permissionKey: grant.permissionKey,
          scope: grant.scope,
        },
        update: {},
      });
      rolePermissions += 1;
    }
  }

  return {
    permissions: PERMISSIONS.length,
    roles: ROLE_DEFINITIONS.length,
    rolePermissions,
    baselineGrants: BASELINE_GRANTS.length,
  };
}
