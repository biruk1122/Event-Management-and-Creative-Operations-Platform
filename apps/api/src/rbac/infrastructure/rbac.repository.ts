import { Injectable } from "@nestjs/common";

import { Prisma, type PermissionScope } from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

export interface RoleRecord {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface GrantRecord {
  permissionKey: string;
  scope: PermissionScope;
}

export interface RoleWithGrantsRecord extends RoleRecord {
  grants: GrantRecord[];
}

export interface PermissionRecord {
  key: string;
  description: string;
}

/** Postgres SQLSTATE-derived Prisma error codes this repository translates. */
const PRISMA_ERROR = {
  uniqueViolation: "P2002",
  foreignKeyViolation: "P2003",
  recordNotFound: "P2025",
} as const;

function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

const ROLE_SELECT = {
  id: true,
  name: true,
  description: true,
  isSystem: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class RbacRepository {
  constructor(private readonly db: DatabaseService) {}

  async listRoles(): Promise<RoleRecord[]> {
    return this.db.role.findMany({
      select: ROLE_SELECT,
      orderBy: { name: "asc" },
    });
  }

  async findRoleById(id: string): Promise<RoleWithGrantsRecord | null> {
    const role = await this.db.role.findUnique({
      where: { id },
      select: {
        ...ROLE_SELECT,
        rolePermissions: {
          select: { permissionKey: true, scope: true },
          orderBy: { permissionKey: "asc" },
        },
      },
    });

    if (!role) {
      return null;
    }

    const { rolePermissions, ...record } = role;
    return { ...record, grants: rolePermissions };
  }

  /** A lean existence check for callers that only need `isSystem`, without
   * the full grant list `findRoleById` returns. */
  async findRoleSummary(
    id: string,
  ): Promise<{ id: string; isSystem: boolean } | null> {
    return this.db.role.findUnique({
      where: { id },
      select: { id: true, isSystem: true },
    });
  }

  /** Returns null on a duplicate name. */
  async createRole(input: {
    name: string;
    description: string | null;
  }): Promise<RoleRecord | null> {
    try {
      return await this.db.role.create({
        data: { name: input.name, description: input.description },
        select: ROLE_SELECT,
      });
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.uniqueViolation)) {
        return null;
      }
      throw error;
    }
  }

  /** Returns `"not_found"`, `"name_conflict"`, or the updated record. */
  async updateRole(
    id: string,
    input: { name?: string; description?: string },
  ): Promise<RoleRecord | "not_found" | "name_conflict"> {
    try {
      return await this.db.role.update({
        where: { id },
        data: input,
        select: ROLE_SELECT,
      });
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.recordNotFound)) {
        return "not_found";
      }
      if (isPrismaError(error, PRISMA_ERROR.uniqueViolation)) {
        return "name_conflict";
      }
      throw error;
    }
  }

  /** Returns `"not_found"`, `"in_use"`, or `"deleted"`. */
  async deleteRole(id: string): Promise<"not_found" | "in_use" | "deleted"> {
    try {
      await this.db.role.delete({ where: { id } });
      return "deleted";
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.recordNotFound)) {
        return "not_found";
      }
      if (isPrismaError(error, PRISMA_ERROR.foreignKeyViolation)) {
        return "in_use";
      }
      throw error;
    }
  }

  /**
   * Returns `"already_exists"` or `"added"`. Callers must confirm the role
   * exists and the permission key is a real catalog entry first (the service
   * layer does, against the static catalog) - this only guards the grant
   * triple's own uniqueness, so a foreign key violation here is unexpected
   * and left to propagate.
   */
  async addGrant(
    roleId: string,
    permissionKey: string,
    scope: PermissionScope,
  ): Promise<"already_exists" | "added"> {
    try {
      await this.db.rolePermission.create({
        data: { roleId, permissionKey, scope },
      });
      return "added";
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.uniqueViolation)) {
        return "already_exists";
      }
      throw error;
    }
  }

  /** Returns `"not_found"` or `"removed"`. */
  async removeGrant(
    roleId: string,
    permissionKey: string,
    scope: PermissionScope,
  ): Promise<"not_found" | "removed"> {
    try {
      await this.db.rolePermission.delete({
        where: { roleId_permissionKey_scope: { roleId, permissionKey, scope } },
      });
      return "removed";
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.recordNotFound)) {
        return "not_found";
      }
      throw error;
    }
  }

  async listPermissions(): Promise<PermissionRecord[]> {
    return this.db.permission.findMany({
      select: { key: true, description: true },
      orderBy: { key: "asc" },
    });
  }
}
