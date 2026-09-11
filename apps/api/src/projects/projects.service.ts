import { Injectable } from "@nestjs/common";

import type {
  ProjectStatus,
  PermissionScope,
} from "../generated/prisma/client.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { WorkspacesRepository } from "../workspaces/infrastructure/workspaces.repository.js";
import type {
  PaginatedProjectsResponse,
  ProjectResponse,
} from "./projects.contracts.js";
import {
  projectHasManagedFiles,
  projectInvalidTransition,
  projectNotFound,
  projectRelatedEventNotFound,
  projectScheduleInvalid,
  projectTeamNotAssigned,
  projectTeamNotFound,
  projectUserNotFound,
} from "./projects.errors.js";
import { canTransition } from "./projects.lifecycle.js";
import type { CreateProjectDto } from "./dto/create-project.dto.js";
import type { ListProjectsQueryDto } from "./dto/list-projects-query.dto.js";
import type { UpdateProjectDto } from "./dto/update-project.dto.js";
import {
  ProjectsRepository,
  type ProjectRecord,
} from "./infrastructure/projects.repository.js";

/**
 * Application service for general project management: the precise
 * authorization boundary (the transport guard only checked that the caller
 * holds the `project.*` key at some scope), the lifecycle and schedule
 * policy, and the mapping from persistence records to public response shapes.
 *
 * Every project route is for a known `kind = PROJECT`, so the static
 * `@RequirePermissions` on the controller names the exact key and this
 * service re-checks it at ORGANIZATION scope - matching WSP-02. Manager and
 * team assignment share a single `project.assign` key (unlike events, which
 * split manager and team keys) and both reuse `WorkspacesRepository` so
 * composition logic (idempotency, "not assigned") lives in one place; the
 * workspace row lifecycle (create with the project, delete with it) lives in
 * `ProjectsRepository`, the pairing PRJ-01 assigned here. There is no budget
 * surface for general projects.
 */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly repository: ProjectsRepository,
    private readonly workspaces: WorkspacesRepository,
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

  /** Loads a project or throws 404; used before a permission check on `:id` routes. */
  private async loadOrThrow(id: string): Promise<ProjectRecord> {
    const project = await this.repository.findById(id);
    if (!project) {
      throw projectNotFound();
    }
    return project;
  }

  /** Re-reads a project that must exist; a `null` here means it was raced away. */
  private async reload(id: string): Promise<ProjectResponse> {
    const project = await this.repository.findById(id);
    if (!project) {
      throw projectNotFound();
    }
    return toProjectResponse(project);
  }

  async list(
    actingUserId: string,
    query: ListProjectsQueryDto,
  ): Promise<PaginatedProjectsResponse> {
    await this.requireGrant(actingUserId, "project.read");

    const { items, total } = await this.repository.list({
      ...(query.status ? { status: query.status } : {}),
      ...(query.eventId ? { eventId: query.eventId } : {}),
      ...(query.managerId ? { managerId: query.managerId } : {}),
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
      ...(query.startingAfter
        ? { startingAfter: new Date(query.startingAfter) }
        : {}),
      ...(query.startingBefore
        ? { startingBefore: new Date(query.startingBefore) }
        : {}),
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      items: items.map(toProjectResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(actingUserId: string, id: string): Promise<ProjectResponse> {
    const project = await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "project.read");
    return toProjectResponse(project);
  }

  async create(
    actingUserId: string,
    dto: CreateProjectDto,
  ): Promise<ProjectResponse> {
    await this.requireGrant(actingUserId, "project.create");

    const startAt = dto.startAt ? new Date(dto.startAt) : undefined;
    const endAt = dto.endAt ? new Date(dto.endAt) : undefined;
    assertScheduleOrdered(startAt ?? null, endAt ?? null);

    const result = await this.repository.create({
      name: dto.name.trim(),
      createdById: actingUserId,
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
      ...(startAt ? { startAt } : {}),
      ...(endAt ? { endAt } : {}),
      ...(dto.eventId ? { eventId: dto.eventId } : {}),
      ...(dto.managerId ? { managerId: dto.managerId } : {}),
    });

    if (result === "manager_not_found") {
      throw projectUserNotFound();
    }
    if (result === "event_not_found") {
      throw projectRelatedEventNotFound();
    }
    return toProjectResponse(result);
  }

  async update(
    actingUserId: string,
    id: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectResponse> {
    const project = await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "project.update");

    const nextStart = resolveInstant(dto.startAt, project.startAt);
    const nextEnd = resolveInstant(dto.endAt, project.endAt);
    assertScheduleOrdered(nextStart, nextEnd);

    const result = await this.repository.update(id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined
        ? {
            description:
              dto.description === null ? null : dto.description.trim(),
          }
        : {}),
      ...(dto.startAt !== undefined
        ? { startAt: dto.startAt === null ? null : new Date(dto.startAt) }
        : {}),
      ...(dto.endAt !== undefined
        ? { endAt: dto.endAt === null ? null : new Date(dto.endAt) }
        : {}),
      ...(dto.eventId !== undefined ? { eventId: dto.eventId } : {}),
    });

    if (result === "not_found") {
      throw projectNotFound();
    }
    if (result === "event_not_found") {
      throw projectRelatedEventNotFound();
    }
    return toProjectResponse(result);
  }

  async transition(
    actingUserId: string,
    id: string,
    target: ProjectStatus,
  ): Promise<ProjectResponse> {
    const project = await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "project.transition_status");

    if (!canTransition(project.status, target)) {
      throw projectInvalidTransition(project.status, target);
    }

    const result = await this.repository.updateStatus(id, target);
    if (result === "not_found") {
      throw projectNotFound();
    }
    return toProjectResponse(result);
  }

  async setManager(
    actingUserId: string,
    id: string,
    managerId: string | null,
  ): Promise<ProjectResponse> {
    const project = await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "project.assign");

    const result = await this.workspaces.setManager(
      project.workspaceId,
      managerId,
    );
    if (result === "not_found") {
      throw projectNotFound();
    }
    if (result === "manager_not_found") {
      throw projectUserNotFound();
    }
    return this.reload(id);
  }

  async assignTeam(
    actingUserId: string,
    id: string,
    teamId: string,
  ): Promise<ProjectResponse> {
    const project = await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "project.assign");

    const result = await this.workspaces.assignTeam(
      project.workspaceId,
      teamId,
    );
    if (result === "workspace_not_found") {
      throw projectNotFound();
    }
    if (result === "team_not_found") {
      throw projectTeamNotFound();
    }
    return this.reload(id);
  }

  async unassignTeam(
    actingUserId: string,
    id: string,
    teamId: string,
  ): Promise<ProjectResponse> {
    const project = await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "project.assign");

    const result = await this.workspaces.unassignTeam(
      project.workspaceId,
      teamId,
    );
    if (result === "workspace_not_found") {
      throw projectNotFound();
    }
    if (result === "not_assigned") {
      throw projectTeamNotAssigned();
    }
    return this.reload(id);
  }

  async remove(actingUserId: string, id: string): Promise<void> {
    await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "project.delete");

    const result = await this.repository.delete(id);
    if (result === "not_found") {
      throw projectNotFound();
    }
    if (result === "has_managed_files") {
      throw projectHasManagedFiles();
    }
  }
}

/** The effective instant of a field after a patch: the new value, or the current one. */
function resolveInstant(
  patched: string | null | undefined,
  current: Date | null,
): Date | null {
  if (patched === undefined) {
    return current;
  }
  return patched === null ? null : new Date(patched);
}

function assertScheduleOrdered(startAt: Date | null, endAt: Date | null): void {
  if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
    throw projectScheduleInvalid();
  }
}

function toProjectResponse(record: ProjectRecord): ProjectResponse {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    name: record.name,
    description: record.description,
    status: record.status,
    startAt: record.startAt ? record.startAt.toISOString() : null,
    endAt: record.endAt ? record.endAt.toISOString() : null,
    eventId: record.eventId,
    manager: record.manager,
    teams: record.teams,
    participants: record.participants,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
