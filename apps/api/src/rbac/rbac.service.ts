import { Injectable } from "@nestjs/common";

import type { PermissionScope } from "../generated/prisma/client.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import type { AddRolePermissionDto } from "./dto/add-role-permission.dto.js";
import type { CreateRoleDto } from "./dto/create-role.dto.js";
import type { UpdateRoleDto } from "./dto/update-role.dto.js";
import {
  RbacRepository,
  type PermissionRecord,
  type RoleRecord,
  type RoleWithGrantsRecord,
} from "./infrastructure/rbac.repository.js";
import { PERMISSIONS } from "./rbac-catalog.js";
import {
  grantAlreadyExists,
  grantNotFound,
  permissionNotFound,
  roleInUse,
  roleIsSystem,
  roleNameConflict,
  roleNotFound,
} from "./rbac.errors.js";
import type {
  PermissionResponse,
  RoleResponse,
  RoleWithGrantsResponse,
} from "./rbac.contracts.js";
import { permissionDenied } from "../common/security/security.errors.js";

const PERMISSION_KEYS = new Set(
  PERMISSIONS.map((permission) => permission.key),
);

/**
 * Application service for role and permission administration: the second,
 * precise authorization boundary (the transport guard checked only that the
 * caller holds the permission key, at any scope), the `role.delete` /
 * `role.configure_permissions` policy rules, and the mapping from persistence
 * records to public response shapes.
 */
@Injectable()
export class RbacService {
  constructor(
    private readonly repository: RbacRepository,
    private readonly permissions: PermissionsService,
  ) {}

  private async requireGrant(
    actingUserId: string,
    permissionKey: string,
    scope: PermissionScope = "ORGANIZATION",
  ): Promise<void> {
    if (
      !(await this.permissions.hasGrant(actingUserId, permissionKey, scope))
    ) {
      throw permissionDenied();
    }
  }

  async listRoles(actingUserId: string): Promise<RoleResponse[]> {
    await this.requireGrant(actingUserId, "role.read");
    const roles = await this.repository.listRoles();
    return roles.map(toRoleResponse);
  }

  async getRole(
    actingUserId: string,
    id: string,
  ): Promise<RoleWithGrantsResponse> {
    await this.requireGrant(actingUserId, "role.read");
    const role = await this.repository.findRoleById(id);
    if (!role) {
      throw roleNotFound();
    }
    return toRoleWithGrantsResponse(role);
  }

  async createRole(
    actingUserId: string,
    dto: CreateRoleDto,
  ): Promise<RoleResponse> {
    await this.requireGrant(actingUserId, "role.create");
    const created = await this.repository.createRole({
      name: dto.name,
      description: dto.description ?? null,
    });
    if (!created) {
      throw roleNameConflict();
    }
    return toRoleResponse(created);
  }

  async updateRole(
    actingUserId: string,
    id: string,
    dto: UpdateRoleDto,
  ): Promise<RoleResponse> {
    await this.requireGrant(actingUserId, "role.update");
    const result = await this.repository.updateRole(id, dto);
    if (result === "not_found") {
      throw roleNotFound();
    }
    if (result === "name_conflict") {
      throw roleNameConflict();
    }
    return toRoleResponse(result);
  }

  async deleteRole(actingUserId: string, id: string): Promise<void> {
    await this.requireGrant(actingUserId, "role.delete");

    const role = await this.repository.findRoleSummary(id);
    if (!role) {
      throw roleNotFound();
    }
    if (role.isSystem) {
      throw roleIsSystem();
    }

    const result = await this.repository.deleteRole(id);
    if (result === "not_found") {
      throw roleNotFound();
    }
    if (result === "in_use") {
      throw roleInUse();
    }
  }

  async addPermission(
    actingUserId: string,
    roleId: string,
    dto: AddRolePermissionDto,
  ): Promise<void> {
    await this.requireGrant(actingUserId, "role.configure_permissions");

    if (!PERMISSION_KEYS.has(dto.permissionKey)) {
      throw permissionNotFound();
    }
    const role = await this.repository.findRoleSummary(roleId);
    if (!role) {
      throw roleNotFound();
    }

    const result = await this.repository.addGrant(
      roleId,
      dto.permissionKey,
      dto.scope,
    );
    if (result === "already_exists") {
      throw grantAlreadyExists();
    }
  }

  async removePermission(
    actingUserId: string,
    roleId: string,
    permissionKey: string,
    scope: PermissionScope,
  ): Promise<void> {
    await this.requireGrant(actingUserId, "role.configure_permissions");

    const role = await this.repository.findRoleSummary(roleId);
    if (!role) {
      throw roleNotFound();
    }

    const result = await this.repository.removeGrant(
      roleId,
      permissionKey,
      scope,
    );
    if (result === "not_found") {
      throw grantNotFound();
    }
  }

  async listPermissions(actingUserId: string): Promise<PermissionResponse[]> {
    await this.requireGrant(actingUserId, "role.read");
    const permissions = await this.repository.listPermissions();
    return permissions.map(toPermissionResponse);
  }
}

function toRoleResponse(role: RoleRecord): RoleResponse {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

function toRoleWithGrantsResponse(
  role: RoleWithGrantsRecord,
): RoleWithGrantsResponse {
  return {
    ...toRoleResponse(role),
    grants: role.grants.map((grant) => ({
      permissionKey: grant.permissionKey,
      scope: grant.scope,
    })),
  };
}

function toPermissionResponse(
  permission: PermissionRecord,
): PermissionResponse {
  return { key: permission.key, description: permission.description };
}
