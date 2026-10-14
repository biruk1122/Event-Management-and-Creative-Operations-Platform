import { HttpException, Injectable } from "@nestjs/common";
import type { ProductionStatus } from "../generated/prisma/client.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { EventsService } from "../events/events.service.js";
import { WorkspacesService } from "../workspaces/workspaces.service.js";
import { WORKSPACE_ERROR } from "../workspaces/workspaces.errors.js";
import { canTransition } from "./productions.lifecycle.js";
import {
  productionConflict,
  productionEventNotFound,
  productionInvalidSchedule,
  productionInvalidTransition,
  productionNotFound,
  productionTalentNotFound,
  productionTeamNotFound,
  productionUserNotFound,
} from "./productions.errors.js";
import {
  ProductionsRepository,
  type ProductionRecord,
} from "./infrastructure/productions.repository.js";
import type { CreateProductionDto } from "./dto/create-production.dto.js";
import type { UpdateProductionDto } from "./dto/update-production.dto.js";
import type { ListProductionsQueryDto } from "./dto/list-productions-query.dto.js";

function resolveDate(
  value: string | null | undefined,
  current: Date | null,
): Date | null {
  return value === undefined
    ? current
    : value === null
      ? null
      : new Date(value);
}
function assertSchedule(start: Date | null, end: Date | null) {
  if (start && end && end < start) throw productionInvalidSchedule();
}
function response(record: ProductionRecord) {
  return {
    ...record,
    startAt: record.startAt?.toISOString() ?? null,
    endAt: record.endAt?.toISOString() ?? null,
    deadlineAt: record.deadlineAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

@Injectable()
export class ProductionsService {
  constructor(
    private readonly repository: ProductionsRepository,
    private readonly workspaces: WorkspacesService,
    private readonly permissions: PermissionsService,
    private readonly events: EventsService,
  ) {}
  private async grant(userId: string, key: string) {
    if (!(await this.permissions.hasGrant(userId, key, "ORGANIZATION")))
      throw permissionDenied();
  }
  private async load(id: string) {
    const item = await this.repository.findById(id);
    if (!item) throw productionNotFound();
    return item;
  }
  private async reload(id: string) {
    return response(await this.load(id));
  }
  /** Keep the production API's established error codes at this module boundary. */
  private async composeWorkspace(
    action: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await action();
    } catch (error) {
      if (error instanceof HttpException) {
        const body = error.getResponse();
        const code =
          typeof body === "object" && body !== null && "code" in body
            ? body.code
            : undefined;
        switch (code) {
          case WORKSPACE_ERROR.workspaceNotFound:
            throw productionNotFound();
          case WORKSPACE_ERROR.userNotFound:
            throw productionUserNotFound();
          case WORKSPACE_ERROR.workspaceTeamNotFound:
            throw productionTeamNotFound();
          case WORKSPACE_ERROR.workspaceTeamNotAssigned:
            throw productionConflict("PRODUCTION_TEAM_NOT_ASSIGNED");
          case WORKSPACE_ERROR.workspaceParticipantNotFound:
            throw productionConflict("PRODUCTION_PARTICIPANT_NOT_ASSIGNED");
        }
      }
      throw error;
    }
  }
  async list(userId: string, query: ListProductionsQueryDto) {
    await this.grant(userId, "project.read");
    const result = await this.repository.list({
      page: query.page,
      pageSize: query.pageSize,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
    });
    return {
      items: result.items.map(response),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
  async get(userId: string, id: string) {
    const item = await this.load(id);
    await this.grant(userId, "project.read");
    return response(item);
  }
  async create(userId: string, dto: CreateProductionDto) {
    await this.grant(userId, "project.create");
    assertSchedule(
      dto.startAt ? new Date(dto.startAt) : null,
      dto.endAt ? new Date(dto.endAt) : null,
    );
    if (dto.eventId && !(await this.repository.eventExists(dto.eventId)))
      throw productionEventNotFound();
    const result = await this.repository.create({
      name: dto.name.trim(),
      productionType: dto.productionType.trim(),
      createdById: userId,
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
      ...(dto.startAt ? { startAt: new Date(dto.startAt) } : {}),
      ...(dto.endAt ? { endAt: new Date(dto.endAt) } : {}),
      ...(dto.deadlineAt ? { deadlineAt: new Date(dto.deadlineAt) } : {}),
      ...(dto.managerId ? { managerId: dto.managerId } : {}),
      ...(dto.eventId ? { eventId: dto.eventId } : {}),
    });
    if (result === "manager_not_found") throw productionUserNotFound();
    return response(result);
  }
  async update(userId: string, id: string, dto: UpdateProductionDto) {
    const current = await this.load(id);
    await this.grant(userId, "project.update");
    assertSchedule(
      resolveDate(dto.startAt, current.startAt),
      resolveDate(dto.endAt, current.endAt),
    );
    if (
      dto.eventId !== undefined &&
      dto.eventId !== null &&
      !(await this.repository.eventExists(dto.eventId))
    )
      throw productionEventNotFound();
    const result = await this.repository.update(id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.productionType !== undefined
        ? { productionType: dto.productionType.trim() }
        : {}),
      ...(dto.description !== undefined
        ? {
            description:
              dto.description === null ? null : dto.description.trim(),
          }
        : {}),
      ...(dto.startAt !== undefined
        ? { startAt: resolveDate(dto.startAt, current.startAt) }
        : {}),
      ...(dto.endAt !== undefined
        ? { endAt: resolveDate(dto.endAt, current.endAt) }
        : {}),
      ...(dto.deadlineAt !== undefined
        ? { deadlineAt: resolveDate(dto.deadlineAt, current.deadlineAt) }
        : {}),
      ...(dto.eventId !== undefined ? { eventId: dto.eventId } : {}),
    });
    if (!result) throw productionNotFound();
    return response(result);
  }
  async transition(userId: string, id: string, status: ProductionStatus) {
    const current = await this.load(id);
    await this.grant(userId, "project.transition_status");
    if (!canTransition(current.status, status))
      throw productionInvalidTransition();
    const result = await this.repository.updateStatus(
      id,
      current.status,
      status,
    );
    if (result === "not_found") throw productionNotFound();
    if (result === "status_changed") throw productionInvalidTransition();
    return response(result);
  }
  async setManager(userId: string, id: string, managerId: string | null) {
    const current = await this.load(id);
    await this.grant(userId, "project.assign");
    await this.composeWorkspace(() =>
      this.workspaces.setManager(userId, current.workspaceId, managerId),
    );
    return this.reload(id);
  }
  async assignTeam(userId: string, id: string, teamId: string) {
    const current = await this.load(id);
    await this.grant(userId, "project.assign");
    await this.composeWorkspace(() =>
      this.workspaces.assignTeam(userId, current.workspaceId, teamId),
    );
    return this.reload(id);
  }
  async unassignTeam(userId: string, id: string, teamId: string) {
    const current = await this.load(id);
    await this.grant(userId, "project.assign");
    await this.composeWorkspace(() =>
      this.workspaces.unassignTeam(userId, current.workspaceId, teamId),
    );
    return this.reload(id);
  }
  async addParticipant(userId: string, id: string, participantId: string) {
    const current = await this.load(id);
    await this.grant(userId, "project.assign");
    await this.composeWorkspace(() =>
      this.workspaces.addParticipant(
        userId,
        current.workspaceId,
        participantId,
      ),
    );
    return this.reload(id);
  }
  async removeParticipant(userId: string, id: string, participantId: string) {
    const current = await this.load(id);
    await this.grant(userId, "project.assign");
    await this.composeWorkspace(() =>
      this.workspaces.removeParticipant(
        userId,
        current.workspaceId,
        participantId,
      ),
    );
    return this.reload(id);
  }
  async assignTalent(
    userId: string,
    id: string,
    talentId: string,
    role: string,
  ) {
    await this.load(id);
    await this.grant(userId, "project.assign");
    const result = await this.repository.assignTalent(
      id,
      talentId,
      role.trim(),
    );
    if (result === "talent_not_found") throw productionTalentNotFound();
    if (result === "already_assigned")
      throw productionConflict("PRODUCTION_TALENT_ALREADY_ASSIGNED");
    return this.reload(id);
  }
  async unassignTalent(userId: string, id: string, talentId: string) {
    await this.load(id);
    await this.grant(userId, "project.assign");
    if (!(await this.repository.unassignTalent(id, talentId)))
      throw productionConflict("PRODUCTION_TALENT_NOT_ASSIGNED");
    return this.reload(id);
  }
  /** Narrow, read-only cross-department coordination (EOM-01): the
   * productions linked to one event, for a caller who can already read that
   * event and holds `project.read` at any scope - not a full department-scope
   * retrofit of this module's own list/get/mutation methods. */
  async listForEvent(userId: string, eventId: string) {
    const [organization, department, self] = await Promise.all([
      this.permissions.hasGrant(userId, "project.read", "ORGANIZATION"),
      this.permissions.hasGrant(userId, "project.read", "DEPARTMENT"),
      this.permissions.hasGrant(userId, "project.read", "SELF"),
    ]);
    if (!organization && !department && !self) throw permissionDenied();
    await this.events.get(userId, eventId);
    return (await this.repository.listByEventId(eventId)).map(response);
  }
  async remove(userId: string, id: string): Promise<void> {
    await this.load(id);
    await this.grant(userId, "project.delete");
    const result = await this.repository.delete(id);
    if (result === "not_found") throw productionNotFound();
    if (result === "in_use")
      throw productionConflict("PRODUCTION_WORKSPACE_IN_USE");
  }
}
