import { Injectable } from "@nestjs/common";

import type { PermissionScope } from "../generated/prisma/client.js";
import { PasswordHasher } from "../auth/domain/password-hasher.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import {
  platformRole,
  supportedDepartment,
} from "../common/security/department-access.policy.js";
import type { CreateUserDto } from "./dto/create-user.dto.js";
import type { ListUsersQueryDto } from "./dto/list-users-query.dto.js";
import type { UpdateUserDto } from "./dto/update-user.dto.js";
import {
  UsersRepository,
  type UserRecord,
} from "./infrastructure/users.repository.js";
import type {
  PaginatedUsersResponse,
  UserResponse,
} from "./users.contracts.js";
import {
  roleNotFound,
  invalidUserAssignment,
  userAlreadyActive,
  userAlreadyInactive,
  userEmailConflict,
  userNotFound,
} from "./users.errors.js";

/**
 * Application service for user and profile administration: the second, precise
 * authorization boundary (the transport guard checked only that the caller
 * holds the `user.*` key, at any scope), the status-transition and
 * role-assignment policy, and the mapping from persistence records to public
 * response shapes.
 *
 * Every `user.*` key is organization-scoped in the seeded matrix, so an exact
 * `(key, ORGANIZATION)` grant check is the correct precise boundary here.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly permissions: PermissionsService,
    private readonly passwordHasher: PasswordHasher,
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

  private async validateAssignment(
    roleId: string | null | undefined,
    departmentId: string | null | undefined,
  ): Promise<void> {
    if (!roleId) throw invalidUserAssignment("Choose a platform role.");
    const role = await this.repository.findRole(roleId);
    if (!role) throw roleNotFound();
    const code = role.isSystem ? platformRole(role.name) : null;
    if (!code)
      throw invalidUserAssignment("Choose one of the three platform roles.");
    if (code !== "SUPER_ADMIN" && !departmentId) {
      throw invalidUserAssignment(
        "Department managers and members require a department.",
      );
    }
    if (departmentId) {
      const department = await this.repository.findDepartment(departmentId);
      if (
        !department ||
        department.deactivatedAt ||
        !supportedDepartment(department.name)
      ) {
        throw invalidUserAssignment("Choose an active platform department.");
      }
    }
  }

  async list(
    actingUserId: string,
    query: ListUsersQueryDto,
  ): Promise<PaginatedUsersResponse> {
    await this.requireGrant(actingUserId, "user.read");
    const { items, total } = await this.repository.list({
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { search: query.search.trim() } : {}),
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items: items.map(toUserResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(actingUserId: string, id: string): Promise<UserResponse> {
    await this.requireGrant(actingUserId, "user.read");
    const user = await this.repository.findById(id);
    if (!user) {
      throw userNotFound();
    }
    return toUserResponse(user);
  }

  async create(
    actingUserId: string,
    dto: CreateUserDto,
  ): Promise<UserResponse> {
    await this.requireGrant(actingUserId, "user.create");

    await this.requireGrant(actingUserId, "user.assign_role");
    if (dto.departmentId)
      await this.requireGrant(actingUserId, "user.assign_department");
    await this.validateAssignment(dto.roleId, dto.departmentId);

    const passwordHash = await this.passwordHasher.hash(dto.temporaryPassword);
    const result = await this.repository.create({
      email: dto.email.toLowerCase(),
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone ?? null,
      profileImage: dto.profileImage ?? null,
      passwordHash,
      roleId: dto.roleId ?? null,
      departmentId: dto.departmentId ?? null,
    });

    if (result === "email_conflict") {
      throw userEmailConflict();
    }
    if (result === "role_not_found") {
      throw roleNotFound();
    }
    return toUserResponse(result);
  }

  async update(
    actingUserId: string,
    id: string,
    dto: UpdateUserDto,
  ): Promise<UserResponse> {
    await this.requireGrant(actingUserId, "user.update");

    if (dto.roleId !== undefined || dto.departmentId !== undefined) {
      const current = await this.repository.findById(id);
      if (!current) throw userNotFound();
      if (dto.roleId !== undefined) {
        await this.requireGrant(actingUserId, "user.assign_role");
        if (
          current.role &&
          platformRole(current.role.name) === "SUPER_ADMIN" &&
          dto.roleId !== current.role.id
        ) {
          throw invalidUserAssignment(
            "The existing Super Admin role must be preserved.",
          );
        }
      }
      if (dto.departmentId !== undefined)
        await this.requireGrant(actingUserId, "user.assign_department");
      await this.validateAssignment(
        dto.roleId ?? current.role?.id,
        dto.departmentId === undefined
          ? current.department?.id
          : dto.departmentId,
      );
    }

    const result = await this.repository.update(id, {
      ...(dto.email !== undefined ? { email: dto.email.toLowerCase() } : {}),
      ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
      ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.profileImage !== undefined
        ? { profileImage: dto.profileImage }
        : {}),
      ...(dto.roleId !== undefined ? { roleId: dto.roleId } : {}),
      ...(dto.departmentId !== undefined
        ? { departmentId: dto.departmentId }
        : {}),
    });

    if (result === "not_found") {
      throw userNotFound();
    }
    if (result === "email_conflict") {
      throw userEmailConflict();
    }
    return toUserResponse(result);
  }

  async deactivate(actingUserId: string, id: string): Promise<UserResponse> {
    await this.requireGrant(actingUserId, "user.deactivate");

    const user = await this.repository.findById(id);
    if (!user) {
      throw userNotFound();
    }
    if (user.role && platformRole(user.role.name) === "SUPER_ADMIN") {
      throw invalidUserAssignment(
        "The Super Admin account must remain active.",
      );
    }
    if (user.status === "INACTIVE") {
      throw userAlreadyInactive();
    }

    const result = await this.repository.setStatus(id, "INACTIVE", new Date());
    if (result === "not_found") {
      throw userNotFound();
    }
    return toUserResponse(result);
  }

  async reactivate(actingUserId: string, id: string): Promise<UserResponse> {
    await this.requireGrant(actingUserId, "user.manage_status");

    const user = await this.repository.findById(id);
    if (!user) {
      throw userNotFound();
    }
    if (user.status === "ACTIVE") {
      throw userAlreadyActive();
    }

    const result = await this.repository.setStatus(id, "ACTIVE", null);
    if (result === "not_found") {
      throw userNotFound();
    }
    return toUserResponse(result);
  }

  async assignRole(
    actingUserId: string,
    id: string,
    roleId: string | null,
  ): Promise<UserResponse> {
    await this.requireGrant(actingUserId, "user.assign_role");

    const user = await this.repository.findById(id);
    if (!user) throw userNotFound();
    if (
      user.role &&
      platformRole(user.role.name) === "SUPER_ADMIN" &&
      roleId !== user.role.id
    ) {
      throw invalidUserAssignment(
        "The existing Super Admin role must be preserved.",
      );
    }
    await this.validateAssignment(roleId, user.department?.id);

    const result = await this.repository.setRole(id, roleId);
    if (result === "user_not_found") {
      throw userNotFound();
    }
    if (result === "role_not_found") {
      throw roleNotFound();
    }
    return toUserResponse(result);
  }
}

function toUserResponse(user: UserRecord): UserResponse {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    profileImage: user.profileImage,
    status: user.status,
    deactivatedAt: user.deactivatedAt ? user.deactivatedAt.toISOString() : null,
    role: user.role,
    department: user.department,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
