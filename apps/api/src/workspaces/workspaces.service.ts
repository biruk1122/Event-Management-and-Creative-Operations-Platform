import { Injectable } from "@nestjs/common";

import type { PermissionScope } from "../generated/prisma/client.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import type {
  PaginatedWorkspacesResponse,
  WorkspaceResponse,
} from "./workspaces.contracts.js";
import { permissionsForKind } from "./workspaces.authz.js";
import {
  workspaceNotFound,
  workspaceParticipantNotFound,
  workspaceTeamNotAssigned,
  workspaceTeamNotFound,
  workspaceUserNotFound,
} from "./workspaces.errors.js";
import type { CreateWorkspaceDto } from "./dto/create-workspace.dto.js";
import type { ListWorkspacesQueryDto } from "./dto/list-workspaces-query.dto.js";
import {
  WorkspacesRepository,
  type WorkspaceRecord,
} from "./infrastructure/workspaces.repository.js";

/**
 * Application service for connected workspace ownership: the precise
 * authorization boundary, and the mapping from persistence records to public
 * response shapes.
 *
 * WSP-02 adds no permission keys. Each operation is authorized with the
 * existing key of the module that owns the workspace, chosen by its `kind`
 * (see `workspaces.authz.ts`). Because that key is only known once the row is
 * loaded, this service - not the static transport guard - is the authoritative
 * check for every `:id` route; the guard chain still enforces authentication
 * and CSRF. Every check is at ORGANIZATION scope, matching the seeded matrix.
 */
@Injectable()
export class WorkspacesService {
  constructor(
    private readonly repository: WorkspacesRepository,
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

  /** Loads a workspace or throws 404; used before a kind-specific grant check. */
  private async loadOrThrow(id: string): Promise<WorkspaceRecord> {
    const workspace = await this.repository.findById(id);
    if (!workspace) {
      throw workspaceNotFound();
    }
    return workspace;
  }

  async list(
    actingUserId: string,
    query: ListWorkspacesQueryDto,
  ): Promise<PaginatedWorkspacesResponse> {
    await this.requireGrant(actingUserId, permissionsForKind(query.kind).read);

    const { items, total } = await this.repository.list({
      kind: query.kind,
      ...(query.managerId ? { managerId: query.managerId } : {}),
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      items: items.map(toWorkspaceResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(actingUserId: string, id: string): Promise<WorkspaceResponse> {
    const workspace = await this.loadOrThrow(id);
    await this.requireGrant(
      actingUserId,
      permissionsForKind(workspace.kind).read,
    );
    return toWorkspaceResponse(workspace);
  }

  async create(
    actingUserId: string,
    dto: CreateWorkspaceDto,
  ): Promise<WorkspaceResponse> {
    await this.requireGrant(actingUserId, permissionsForKind(dto.kind).create);

    const result = await this.repository.create({
      kind: dto.kind,
      managerId: dto.managerId ?? null,
    });
    if (result === "manager_not_found") {
      throw workspaceUserNotFound();
    }
    return toWorkspaceResponse(result);
  }

  async setManager(
    actingUserId: string,
    id: string,
    managerId: string | null,
  ): Promise<WorkspaceResponse> {
    const workspace = await this.loadOrThrow(id);
    await this.requireGrant(
      actingUserId,
      permissionsForKind(workspace.kind).assignManager,
    );

    const result = await this.repository.setManager(id, managerId);
    if (result === "not_found") {
      throw workspaceNotFound();
    }
    if (result === "manager_not_found") {
      throw workspaceUserNotFound();
    }
    return toWorkspaceResponse(result);
  }

  async remove(actingUserId: string, id: string): Promise<void> {
    const workspace = await this.loadOrThrow(id);
    await this.requireGrant(
      actingUserId,
      permissionsForKind(workspace.kind).remove,
    );

    const result = await this.repository.delete(id);
    if (result === "not_found") {
      throw workspaceNotFound();
    }
  }

  async assignTeam(
    actingUserId: string,
    id: string,
    teamId: string,
  ): Promise<WorkspaceResponse> {
    const workspace = await this.loadOrThrow(id);
    await this.requireGrant(
      actingUserId,
      permissionsForKind(workspace.kind).assignMembers,
    );

    const result = await this.repository.assignTeam(id, teamId);
    if (result === "workspace_not_found") {
      throw workspaceNotFound();
    }
    if (result === "team_not_found") {
      throw workspaceTeamNotFound();
    }
    return toWorkspaceResponse(result);
  }

  async unassignTeam(
    actingUserId: string,
    id: string,
    teamId: string,
  ): Promise<WorkspaceResponse> {
    const workspace = await this.loadOrThrow(id);
    await this.requireGrant(
      actingUserId,
      permissionsForKind(workspace.kind).assignMembers,
    );

    const result = await this.repository.unassignTeam(id, teamId);
    if (result === "workspace_not_found") {
      throw workspaceNotFound();
    }
    if (result === "not_assigned") {
      throw workspaceTeamNotAssigned();
    }
    return toWorkspaceResponse(result);
  }

  async addParticipant(
    actingUserId: string,
    id: string,
    userId: string,
  ): Promise<WorkspaceResponse> {
    const workspace = await this.loadOrThrow(id);
    await this.requireGrant(
      actingUserId,
      permissionsForKind(workspace.kind).assignMembers,
    );

    const result = await this.repository.addParticipant(id, userId);
    if (result === "workspace_not_found") {
      throw workspaceNotFound();
    }
    if (result === "user_not_found") {
      throw workspaceUserNotFound();
    }
    return toWorkspaceResponse(result);
  }

  async removeParticipant(
    actingUserId: string,
    id: string,
    userId: string,
  ): Promise<WorkspaceResponse> {
    const workspace = await this.loadOrThrow(id);
    await this.requireGrant(
      actingUserId,
      permissionsForKind(workspace.kind).assignMembers,
    );

    const result = await this.repository.removeParticipant(id, userId);
    if (result === "workspace_not_found") {
      throw workspaceNotFound();
    }
    if (result === "not_a_participant") {
      throw workspaceParticipantNotFound();
    }
    return toWorkspaceResponse(result);
  }
}

function toWorkspaceResponse(record: WorkspaceRecord): WorkspaceResponse {
  return {
    id: record.id,
    kind: record.kind,
    manager: record.manager,
    teams: record.teams,
    participants: record.participants,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
