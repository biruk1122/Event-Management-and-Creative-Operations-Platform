import { HttpException, Injectable } from "@nestjs/common";
import type {
  PermissionScope,
  ProductionStatus,
} from "../generated/prisma/client.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { EventsService } from "../events/events.service.js";
import { WorkspacesService } from "../workspaces/workspaces.service.js";
import { WORKSPACE_ERROR } from "../workspaces/workspaces.errors.js";
import { canTransition } from "./productions.lifecycle.js";
import {
  productionBudgetIncomplete,
  productionConflict,
  productionDepartmentNotFound,
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
  type ProductionVisibility,
} from "./infrastructure/productions.repository.js";
import type {
  ProductionBudgetResponse,
  ProductionBudgetSummaryResponse,
} from "./productions.contracts.js";
import type { CreateProductionDto } from "./dto/create-production.dto.js";
import type { SetProductionBudgetDto } from "./dto/set-production-budget.dto.js";
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
/** Deliberately excludes `budgetAmount`/`budgetCurrency` - the budget is
 * sensitive (PC-04) and is served only through the dedicated budget routes,
 * mirroring `events.service.ts#toEventResponse`. */
function response(record: ProductionRecord) {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    name: record.name,
    productionType: record.productionType,
    description: record.description,
    startAt: record.startAt?.toISOString() ?? null,
    endAt: record.endAt?.toISOString() ?? null,
    deadlineAt: record.deadlineAt?.toISOString() ?? null,
    status: record.status,
    eventId: record.eventId,
    departmentId: record.departmentId,
    manager: record.manager,
    teams: record.teams,
    participants: record.participants,
    talents: record.talents,
    createdBy: record.createdBy,
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
  private async hasGrant(
    userId: string,
    key: string,
    scope: PermissionScope,
  ): Promise<boolean> {
    return this.permissions.hasGrant(userId, key, scope);
  }
  /** Mirrors `events.service.ts#visibilityFor`: an organization-scoped caller
   * (Super Admin) sees every production, a department-scoped caller (the
   * Production Department Manager) sees only productions carrying their own
   * `departmentId`. A pre-existing production with `departmentId = null`
   * stays organization-only until someone explicitly assigns it one. */
  private async visibilityFor(
    userId: string,
    key: string,
  ): Promise<ProductionVisibility> {
    const [organization, department] = await Promise.all([
      this.hasGrant(userId, key, "ORGANIZATION"),
      this.hasGrant(userId, key, "DEPARTMENT"),
    ]);
    if (!organization && !department) throw permissionDenied();
    const departmentId = department
      ? await this.repository.findUserDepartmentId(userId)
      : null;
    return { organization, ...(departmentId ? { departmentId } : {}) };
  }
  /** Resolves visibility for `permissionKey` and loads the production only
   * if visible under that grant; an organization-scoped caller gets a real
   * 404 for an unknown id, a narrower caller gets the same denial for an
   * absent id and an out-of-scope id, so ids cannot be used to probe
   * productions outside their department. */
  private async loadAuthorized(
    userId: string,
    id: string,
    key: string,
  ): Promise<ProductionRecord> {
    const visibility = await this.visibilityFor(userId, key);
    const item = await this.repository.findVisibleById(id, visibility);
    if (!item) {
      if (visibility.organization) throw productionNotFound();
      throw permissionDenied();
    }
    return item;
  }
  /** Re-reads a production that must exist right after an authorized
   * mutation on it; the mutation's own `loadAuthorized` call already proved
   * the caller may act on this id, so this is a raw fetch, not a second
   * authorization check. */
  private async reload(id: string) {
    const item = await this.repository.findById(id);
    if (!item) throw productionNotFound();
    return response(item);
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
    const visibility = await this.visibilityFor(userId, "project.read");
    const result = await this.repository.list({
      visibility,
      page: query.page,
      pageSize: query.pageSize,
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
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
    return response(await this.loadAuthorized(userId, id, "project.read"));
  }
  async create(userId: string, dto: CreateProductionDto) {
    const visibility = await this.visibilityFor(userId, "project.create");
    if (!visibility.organization) {
      // A department-scoped creator's production is scoped to their own
      // department (never trusted from client input); an explicit
      // `departmentId` must match it exactly.
      if (dto.departmentId && dto.departmentId !== visibility.departmentId)
        throw permissionDenied();
      if (!visibility.departmentId) throw permissionDenied();
    } else if (
      dto.departmentId &&
      !(await this.repository.departmentExists(dto.departmentId))
    ) {
      throw productionDepartmentNotFound();
    }
    assertSchedule(
      dto.startAt ? new Date(dto.startAt) : null,
      dto.endAt ? new Date(dto.endAt) : null,
    );
    if (dto.eventId && !(await this.repository.eventExists(dto.eventId)))
      throw productionEventNotFound();
    const departmentId = visibility.organization
      ? dto.departmentId
      : visibility.departmentId;
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
      ...(departmentId ? { departmentId } : {}),
    });
    if (result === "manager_not_found") throw productionUserNotFound();
    return response(result);
  }
  async update(userId: string, id: string, dto: UpdateProductionDto) {
    const current = await this.loadAuthorized(userId, id, "project.update");
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
    const current = await this.loadAuthorized(
      userId,
      id,
      "project.transition_status",
    );
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
    const current = await this.loadAuthorized(userId, id, "project.assign");
    await this.composeWorkspace(() =>
      this.workspaces.setManager(userId, current.workspaceId, managerId),
    );
    return this.reload(id);
  }
  async assignTeam(userId: string, id: string, teamId: string) {
    const current = await this.loadAuthorized(userId, id, "project.assign");
    await this.composeWorkspace(() =>
      this.workspaces.assignTeam(userId, current.workspaceId, teamId),
    );
    return this.reload(id);
  }
  async unassignTeam(userId: string, id: string, teamId: string) {
    const current = await this.loadAuthorized(userId, id, "project.assign");
    await this.composeWorkspace(() =>
      this.workspaces.unassignTeam(userId, current.workspaceId, teamId),
    );
    return this.reload(id);
  }
  async addParticipant(userId: string, id: string, participantId: string) {
    const current = await this.loadAuthorized(userId, id, "project.assign");
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
    const current = await this.loadAuthorized(userId, id, "project.assign");
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
    await this.loadAuthorized(userId, id, "project.assign");
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
    await this.loadAuthorized(userId, id, "project.assign");
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
  /** Internal authorization boundary reused by the production-locations
   * sub-resource (mirrors `TasksService.authorize`). */
  async authorize(
    userId: string,
    id: string,
    permissionKey: string,
  ): Promise<ProductionRecord> {
    return this.loadAuthorized(userId, id, permissionKey);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.loadAuthorized(userId, id, "project.delete");
    const result = await this.repository.delete(id);
    if (result === "not_found") throw productionNotFound();
    if (result === "in_use")
      throw productionConflict("PRODUCTION_WORKSPACE_IN_USE");
  }

  async getBudget(
    userId: string,
    id: string,
  ): Promise<ProductionBudgetResponse> {
    const production = await this.loadBudgetRecord(
      userId,
      id,
      "production.budget.read",
    );
    return {
      amount: production.budgetAmount,
      currency: production.budgetCurrency,
    };
  }

  async getBudgetSummary(
    userId: string,
    id: string,
  ): Promise<ProductionBudgetSummaryResponse> {
    await this.loadBudgetRecord(userId, id, "production.budget.read");
    const summary = await this.repository.budgetSummary(id);
    if (!summary) throw productionNotFound();
    return summary;
  }

  async setBudget(
    userId: string,
    id: string,
    dto: SetProductionBudgetDto,
  ): Promise<ProductionBudgetResponse> {
    await this.loadBudgetRecord(userId, id, "production.budget.update");
    if ((dto.amount === null) !== (dto.currency === null))
      throw productionBudgetIncomplete();
    const amount = dto.amount === null ? null : dto.amount.toFixed(2);
    const result = await this.repository.setBudget(id, amount, dto.currency);
    if (result === "not_found") throw productionNotFound();
    return { amount: result.budgetAmount, currency: result.budgetCurrency };
  }

  /** Budget routes authorize against the production's own visibility (not
   * `project.read`/`project.update`) since the budget keys are deliberately
   * separate and sensitive (PC-04) - mirrors `events.service.ts`'s budget
   * methods exactly. Returns the raw repository record (budget fields
   * included) rather than the public `response()` shape, which excludes them. */
  private async loadBudgetRecord(
    userId: string,
    id: string,
    key: string,
  ): Promise<ProductionRecord> {
    const visibility = await this.visibilityFor(userId, key);
    const item = await this.repository.findVisibleById(id, visibility);
    if (!item) {
      if (visibility.organization) throw productionNotFound();
      throw permissionDenied();
    }
    return item;
  }
}
