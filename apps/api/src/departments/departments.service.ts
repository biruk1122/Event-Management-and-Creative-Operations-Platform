import { Injectable } from "@nestjs/common";

import type { PermissionScope } from "../generated/prisma/client.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import type { CreateDepartmentDto } from "./dto/create-department.dto.js";
import {
  DepartmentActivityFilter,
  type ListDepartmentsQueryDto,
} from "./dto/list-departments-query.dto.js";
import type { UpdateDepartmentDto } from "./dto/update-department.dto.js";
import type { DepartmentResponse } from "./departments.contracts.js";
import type { PaginatedDepartmentsResponse } from "./departments.contracts.js";
import {
  departmentAlreadyActive,
  departmentAlreadyInactive,
  departmentInUse,
  departmentNameConflict,
  departmentNotFound,
  departmentUserNotFound,
  userNotInDepartment,
} from "./departments.errors.js";
import {
  DepartmentsRepository,
  type DepartmentRecord,
} from "./infrastructure/departments.repository.js";

type ReadScope = { kind: "all" } | { kind: "own"; departmentId: string | null };

/**
 * Application service for department management: the second, precise
 * authorization boundary (the transport guard checked only that the caller
 * holds the `department.*` / `user.assign_department` key, at any scope), the
 * composition and deactivation policy, and the mapping from persistence
 * records to public response shapes.
 *
 * Every write key is organization-scoped in the seeded matrix, so an exact
 * `(key, ORGANIZATION)` grant check is the precise boundary for mutations.
 * Reads are scope-aware: `department.read` at ORGANIZATION sees every
 * department; at DEPARTMENT it sees only the caller's own.
 */
@Injectable()
export class DepartmentsService {
  constructor(
    private readonly repository: DepartmentsRepository,
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

  private async resolveReadScope(actingUserId: string): Promise<ReadScope> {
    if (
      await this.permissions.hasGrant(
        actingUserId,
        "department.read",
        "ORGANIZATION",
      )
    ) {
      return { kind: "all" };
    }
    if (
      await this.permissions.hasGrant(
        actingUserId,
        "department.read",
        "DEPARTMENT",
      )
    ) {
      return {
        kind: "own",
        departmentId: await this.repository.findUserDepartmentId(actingUserId),
      };
    }
    throw permissionDenied();
  }

  async list(
    actingUserId: string,
    query: ListDepartmentsQueryDto,
  ): Promise<PaginatedDepartmentsResponse> {
    const readScope = await this.resolveReadScope(actingUserId);

    const { items, total } = await this.repository.list({
      ...(query.search ? { search: query.search.trim() } : {}),
      ...(query.status === DepartmentActivityFilter.ACTIVE
        ? { active: true }
        : {}),
      ...(query.status === DepartmentActivityFilter.INACTIVE
        ? { active: false }
        : {}),
      ...(readScope.kind === "own"
        ? { ids: readScope.departmentId ? [readScope.departmentId] : [] }
        : {}),
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      items: items.map(toDepartmentResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(actingUserId: string, id: string): Promise<DepartmentResponse> {
    const readScope = await this.resolveReadScope(actingUserId);
    if (readScope.kind === "own" && readScope.departmentId !== id) {
      throw permissionDenied();
    }

    const department = await this.repository.findById(id);
    if (!department) {
      throw departmentNotFound();
    }
    return toDepartmentResponse(department);
  }

  async create(
    actingUserId: string,
    dto: CreateDepartmentDto,
  ): Promise<DepartmentResponse> {
    await this.requireGrant(actingUserId, "department.create");

    const result = await this.repository.create({
      name: dto.name.trim(),
      description: dto.description?.trim() ?? null,
      managerId: dto.managerId ?? null,
    });

    if (result === "name_conflict") {
      throw departmentNameConflict();
    }
    if (result === "manager_not_found") {
      throw departmentUserNotFound();
    }
    return toDepartmentResponse(result);
  }

  async update(
    actingUserId: string,
    id: string,
    dto: UpdateDepartmentDto,
  ): Promise<DepartmentResponse> {
    await this.requireGrant(actingUserId, "department.update");

    const result = await this.repository.update(id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
    });

    if (result === "not_found") {
      throw departmentNotFound();
    }
    if (result === "name_conflict") {
      throw departmentNameConflict();
    }
    return toDepartmentResponse(result);
  }

  async setManager(
    actingUserId: string,
    id: string,
    managerId: string | null,
  ): Promise<DepartmentResponse> {
    await this.requireGrant(actingUserId, "department.assign_manager");

    const result = await this.repository.setManager(id, managerId);
    if (result === "not_found") {
      throw departmentNotFound();
    }
    if (result === "manager_not_found") {
      throw departmentUserNotFound();
    }
    return toDepartmentResponse(result);
  }

  async deactivate(
    actingUserId: string,
    id: string,
  ): Promise<DepartmentResponse> {
    await this.requireGrant(actingUserId, "department.update");

    const department = await this.repository.findById(id);
    if (!department) {
      throw departmentNotFound();
    }
    if (department.deactivatedAt !== null) {
      throw departmentAlreadyInactive();
    }

    const result = await this.repository.setDeactivated(id, new Date());
    if (result === "not_found") {
      throw departmentNotFound();
    }
    return toDepartmentResponse(result);
  }

  async reactivate(
    actingUserId: string,
    id: string,
  ): Promise<DepartmentResponse> {
    await this.requireGrant(actingUserId, "department.update");

    const department = await this.repository.findById(id);
    if (!department) {
      throw departmentNotFound();
    }
    if (department.deactivatedAt === null) {
      throw departmentAlreadyActive();
    }

    const result = await this.repository.setDeactivated(id, null);
    if (result === "not_found") {
      throw departmentNotFound();
    }
    return toDepartmentResponse(result);
  }

  async remove(actingUserId: string, id: string): Promise<void> {
    await this.requireGrant(actingUserId, "department.delete");

    const result = await this.repository.deleteIfEmpty(id);
    if (result === "not_found") {
      throw departmentNotFound();
    }
    if (result === "in_use") {
      throw departmentInUse();
    }
  }

  async assignEmployee(
    actingUserId: string,
    id: string,
    userId: string,
  ): Promise<DepartmentResponse> {
    await this.requireGrant(actingUserId, "user.assign_department");

    const result = await this.repository.assignEmployee(id, userId);
    if (result === "department_not_found") {
      throw departmentNotFound();
    }
    if (result === "user_not_found") {
      throw departmentUserNotFound();
    }
    return toDepartmentResponse(result);
  }

  async removeEmployee(
    actingUserId: string,
    id: string,
    userId: string,
  ): Promise<DepartmentResponse> {
    await this.requireGrant(actingUserId, "user.assign_department");

    const result = await this.repository.removeEmployee(id, userId);
    if (result === "department_not_found") {
      throw departmentNotFound();
    }
    if (result === "user_not_found") {
      throw departmentUserNotFound();
    }
    if (result === "not_a_member") {
      throw userNotInDepartment();
    }
    return toDepartmentResponse(result);
  }
}

function toDepartmentResponse(record: DepartmentRecord): DepartmentResponse {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    manager: record.manager,
    employeeCount: record.employeeCount,
    deactivatedAt: record.deactivatedAt
      ? record.deactivatedAt.toISOString()
      : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
