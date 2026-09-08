import { Injectable } from "@nestjs/common";

import type { PermissionScope } from "../generated/prisma/client.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import type {
  PaginatedTeamsResponse,
  TeamResponse,
} from "./teams.contracts.js";
import {
  teamAlreadyActive,
  teamAlreadyInactive,
  teamDepartmentNotFound,
  teamInUse,
  teamNameConflict,
  teamNotFound,
  teamUserNotFound,
  userNotInTeam,
} from "./teams.errors.js";
import type { CreateTeamDto } from "./dto/create-team.dto.js";
import {
  TeamActivityFilter,
  type ListTeamsQueryDto,
} from "./dto/list-teams-query.dto.js";
import type { UpdateTeamDto } from "./dto/update-team.dto.js";
import {
  TeamsRepository,
  type TeamRecord,
} from "./infrastructure/teams.repository.js";

type ReadScope = { kind: "all" } | { kind: "own"; departmentId: string | null };

/**
 * Application service for team management: the second, precise authorization
 * boundary (the transport guard checked only that the caller holds the
 * `team.*` key, at any scope), the composition and deactivation policy, and
 * the mapping from persistence records to public response shapes.
 *
 * Every write key is organization-scoped in the seeded matrix, so an exact
 * `(key, ORGANIZATION)` grant check is the precise boundary for mutations.
 * Reads are scope-aware: `team.read` at ORGANIZATION sees every team; at
 * DEPARTMENT it sees only the teams owned by the caller's own department.
 */
@Injectable()
export class TeamsService {
  constructor(
    private readonly repository: TeamsRepository,
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
      await this.permissions.hasGrant(actingUserId, "team.read", "ORGANIZATION")
    ) {
      return { kind: "all" };
    }
    if (
      await this.permissions.hasGrant(actingUserId, "team.read", "DEPARTMENT")
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
    query: ListTeamsQueryDto,
  ): Promise<PaginatedTeamsResponse> {
    const readScope = await this.resolveReadScope(actingUserId);

    const departmentIds = this.resolveListDepartments(readScope, query);

    const { items, total } = await this.repository.list({
      ...(query.search ? { search: query.search.trim() } : {}),
      ...(query.status === TeamActivityFilter.ACTIVE ? { active: true } : {}),
      ...(query.status === TeamActivityFilter.INACTIVE
        ? { active: false }
        : {}),
      ...(departmentIds ? { departmentIds } : {}),
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      items: items.map(toTeamResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /**
   * The department filter to apply to the list. A department-scoped reader is
   * pinned to their own department (and sees nothing if they have none); an
   * organization-scoped reader may narrow to one department via the query.
   */
  private resolveListDepartments(
    readScope: ReadScope,
    query: ListTeamsQueryDto,
  ): string[] | undefined {
    if (readScope.kind === "own") {
      if (!readScope.departmentId) {
        return [];
      }
      if (query.departmentId && query.departmentId !== readScope.departmentId) {
        return [];
      }
      return [readScope.departmentId];
    }
    return query.departmentId ? [query.departmentId] : undefined;
  }

  async get(actingUserId: string, id: string): Promise<TeamResponse> {
    const readScope = await this.resolveReadScope(actingUserId);

    const team = await this.repository.findById(id);
    if (
      readScope.kind === "own" &&
      (!team || readScope.departmentId !== team.department.id)
    ) {
      // A department-scoped caller learns nothing about teams outside their
      // department, not even whether the id exists: one code for both.
      throw permissionDenied();
    }
    if (!team) {
      throw teamNotFound();
    }
    return toTeamResponse(team);
  }

  async create(
    actingUserId: string,
    dto: CreateTeamDto,
  ): Promise<TeamResponse> {
    await this.requireGrant(actingUserId, "team.create");

    if (!(await this.repository.departmentExists(dto.departmentId))) {
      throw teamDepartmentNotFound();
    }

    const result = await this.repository.create({
      name: dto.name.trim(),
      departmentId: dto.departmentId,
      description: dto.description?.trim() ?? null,
      managerId: dto.managerId ?? null,
    });

    if (result === "name_conflict") {
      throw teamNameConflict();
    }
    if (result === "manager_not_found") {
      throw teamUserNotFound();
    }
    return toTeamResponse(result);
  }

  async update(
    actingUserId: string,
    id: string,
    dto: UpdateTeamDto,
  ): Promise<TeamResponse> {
    await this.requireGrant(actingUserId, "team.update");

    const result = await this.repository.update(id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
    });

    if (result === "not_found") {
      throw teamNotFound();
    }
    if (result === "name_conflict") {
      throw teamNameConflict();
    }
    return toTeamResponse(result);
  }

  async setManager(
    actingUserId: string,
    id: string,
    managerId: string | null,
  ): Promise<TeamResponse> {
    await this.requireGrant(actingUserId, "team.assign_manager");

    const result = await this.repository.setManager(id, managerId);
    if (result === "not_found") {
      throw teamNotFound();
    }
    if (result === "manager_not_found") {
      throw teamUserNotFound();
    }
    return toTeamResponse(result);
  }

  async deactivate(actingUserId: string, id: string): Promise<TeamResponse> {
    await this.requireGrant(actingUserId, "team.update");

    const team = await this.repository.findById(id);
    if (!team) {
      throw teamNotFound();
    }
    if (team.deactivatedAt !== null) {
      throw teamAlreadyInactive();
    }

    const result = await this.repository.setDeactivated(id, new Date());
    if (result === "not_found") {
      throw teamNotFound();
    }
    return toTeamResponse(result);
  }

  async reactivate(actingUserId: string, id: string): Promise<TeamResponse> {
    await this.requireGrant(actingUserId, "team.update");

    const team = await this.repository.findById(id);
    if (!team) {
      throw teamNotFound();
    }
    if (team.deactivatedAt === null) {
      throw teamAlreadyActive();
    }

    const result = await this.repository.setDeactivated(id, null);
    if (result === "not_found") {
      throw teamNotFound();
    }
    return toTeamResponse(result);
  }

  async remove(actingUserId: string, id: string): Promise<void> {
    await this.requireGrant(actingUserId, "team.delete");

    const result = await this.repository.deleteIfEmpty(id);
    if (result === "not_found") {
      throw teamNotFound();
    }
    if (result === "in_use") {
      throw teamInUse();
    }
  }

  async addMember(
    actingUserId: string,
    id: string,
    userId: string,
  ): Promise<TeamResponse> {
    await this.requireGrant(actingUserId, "team.manage_members");

    const result = await this.repository.addMember(id, userId);
    if (result === "team_not_found") {
      throw teamNotFound();
    }
    if (result === "user_not_found") {
      throw teamUserNotFound();
    }
    return toTeamResponse(result);
  }

  async removeMember(
    actingUserId: string,
    id: string,
    userId: string,
  ): Promise<TeamResponse> {
    await this.requireGrant(actingUserId, "team.manage_members");

    const result = await this.repository.removeMember(id, userId);
    if (result === "team_not_found") {
      throw teamNotFound();
    }
    if (result === "user_not_found") {
      throw teamUserNotFound();
    }
    if (result === "not_a_member") {
      throw userNotInTeam();
    }
    return toTeamResponse(result);
  }
}

function toTeamResponse(record: TeamRecord): TeamResponse {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    department: record.department,
    manager: record.manager,
    members: record.members,
    deactivatedAt: record.deactivatedAt
      ? record.deactivatedAt.toISOString()
      : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
