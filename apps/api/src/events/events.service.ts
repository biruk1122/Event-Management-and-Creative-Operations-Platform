import { Injectable } from "@nestjs/common";

import type {
  EventStatus,
  PermissionScope,
} from "../generated/prisma/client.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { WorkspacesRepository } from "../workspaces/infrastructure/workspaces.repository.js";
import type {
  EventBudgetResponse,
  EventBudgetSummaryResponse,
  EventResponse,
  PaginatedEventsResponse,
} from "./events.contracts.js";
import {
  eventBudgetIncomplete,
  eventHasManagedFiles,
  eventInvalidTransition,
  eventNotFound,
  eventScheduleInvalid,
  eventTeamNotAssigned,
  eventTeamNotFound,
  eventUserNotFound,
} from "./events.errors.js";
import { canTransition } from "./events.lifecycle.js";
import type { CreateEventDto } from "./dto/create-event.dto.js";
import type { ListEventsQueryDto } from "./dto/list-events-query.dto.js";
import type { SetEventBudgetDto } from "./dto/set-event-budget.dto.js";
import type { UpdateEventDto } from "./dto/update-event.dto.js";
import {
  EventsRepository,
  type EventRecord,
  type EventVisibility,
} from "./infrastructure/events.repository.js";

/**
 * Application service for event management: the precise authorization boundary
 * (the transport guard only checked that the caller holds the `event.*` key at
 * some scope), the lifecycle and schedule policy, and the mapping from
 * persistence records to public response shapes.
 *
 * EOM-01 made events department-scoped: `visibilityFor` mirrors the pattern
 * already proven in `tasks.service.ts`/`reports.service.ts` - an
 * organization-scoped caller (Super Admin) sees every event, a
 * department-scoped caller (the Event & Office Manager / another department
 * manager) sees only events carrying their own `departmentId`. A pre-existing
 * event with `departmentId = null` is visible only at ORGANIZATION scope,
 * exactly as before this change, until someone explicitly assigns it a
 * department. Manager and team assignment reuse `WorkspacesRepository` so that
 * composition logic (idempotency, "not assigned") lives in one place; the
 * workspace row lifecycle (create with the event, delete with it) lives in
 * `EventsRepository`, the pairing EVT-01 assigned here. The budget is
 * sensitive (PC-04) and is reachable only through the two budget routes and
 * their own keys.
 */
@Injectable()
export class EventsService {
  constructor(
    private readonly repository: EventsRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly permissions: PermissionsService,
  ) {}

  private async hasGrant(
    actingUserId: string,
    permissionKey: string,
    scope: PermissionScope,
  ): Promise<boolean> {
    return this.permissions.hasGrant(actingUserId, permissionKey, scope);
  }

  private async visibilityFor(
    actingUserId: string,
    permissionKey: string,
  ): Promise<EventVisibility> {
    const [organization, department] = await Promise.all([
      this.hasGrant(actingUserId, permissionKey, "ORGANIZATION"),
      this.hasGrant(actingUserId, permissionKey, "DEPARTMENT"),
    ]);
    if (!organization && !department) throw permissionDenied();
    const departmentId = department
      ? await this.repository.findUserDepartmentId(actingUserId)
      : null;
    return { organization, ...(departmentId ? { departmentId } : {}) };
  }

  /** Resolves visibility for `permissionKey` and loads the event only if it
   * is visible under that grant; an organization-scoped caller gets a real
   * 404 for an unknown id, a narrower caller gets the same denial for an
   * absent id and an out-of-scope id, so ids cannot be used to probe events
   * outside their department. */
  private async loadAuthorized(
    actingUserId: string,
    id: string,
    permissionKey: string,
  ): Promise<EventRecord> {
    const visibility = await this.visibilityFor(actingUserId, permissionKey);
    const event = await this.repository.findVisibleById(id, visibility);
    if (!event) {
      if (visibility.organization) throw eventNotFound();
      throw permissionDenied();
    }
    return event;
  }

  /** Re-reads an event that must exist right after an authorized mutation on
   * it; the mutation's own `loadAuthorized` call already proved the caller
   * may act on this id, so this is a raw fetch, not a second authorization
   * check (matching the pre-retrofit `reload()` this replaces). */
  private async reload(id: string): Promise<EventResponse> {
    const event = await this.repository.findById(id);
    if (!event) throw eventNotFound();
    return toEventResponse(event);
  }

  async list(
    actingUserId: string,
    query: ListEventsQueryDto,
  ): Promise<PaginatedEventsResponse> {
    const visibility = await this.visibilityFor(actingUserId, "event.read");

    const { items, total } = await this.repository.list({
      visibility,
      ...(query.status ? { status: query.status } : {}),
      ...(query.eventType ? { eventType: query.eventType } : {}),
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
      items: items.map(toEventResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(actingUserId: string, id: string): Promise<EventResponse> {
    return toEventResponse(
      await this.loadAuthorized(actingUserId, id, "event.read"),
    );
  }

  async create(
    actingUserId: string,
    dto: CreateEventDto,
  ): Promise<EventResponse> {
    const visibility = await this.visibilityFor(actingUserId, "event.create");

    const startAt = dto.startAt ? new Date(dto.startAt) : undefined;
    const endAt = dto.endAt ? new Date(dto.endAt) : undefined;
    assertScheduleOrdered(startAt ?? null, endAt ?? null);

    const result = await this.repository.create({
      name: dto.name.trim(),
      eventType: dto.eventType,
      createdById: actingUserId,
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
      ...(startAt ? { startAt } : {}),
      ...(endAt ? { endAt } : {}),
      ...(dto.location !== undefined ? { location: dto.location.trim() } : {}),
      ...(dto.organizerName !== undefined
        ? { organizerName: dto.organizerName.trim() }
        : {}),
      ...(dto.managerId ? { managerId: dto.managerId } : {}),
      // A department-scoped creator's event is scoped to their own
      // department (never from client input); an organization-scoped
      // creator leaves it unset (decision 2: no department is ever guessed).
      ...(!visibility.organization && visibility.departmentId
        ? { departmentId: visibility.departmentId }
        : {}),
    });

    if (result === "manager_not_found") {
      throw eventUserNotFound();
    }
    return toEventResponse(result);
  }

  async update(
    actingUserId: string,
    id: string,
    dto: UpdateEventDto,
  ): Promise<EventResponse> {
    const event = await this.loadAuthorized(actingUserId, id, "event.update");

    const nextStart = resolveInstant(dto.startAt, event.startAt);
    const nextEnd = resolveInstant(dto.endAt, event.endAt);
    assertScheduleOrdered(nextStart, nextEnd);

    const result = await this.repository.update(id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.eventType !== undefined ? { eventType: dto.eventType } : {}),
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
      ...(dto.location !== undefined
        ? { location: dto.location === null ? null : dto.location.trim() }
        : {}),
      ...(dto.organizerName !== undefined
        ? {
            organizerName:
              dto.organizerName === null ? null : dto.organizerName.trim(),
          }
        : {}),
    });

    if (result === "not_found") {
      throw eventNotFound();
    }
    return toEventResponse(result);
  }

  async transition(
    actingUserId: string,
    id: string,
    target: EventStatus,
  ): Promise<EventResponse> {
    const event = await this.loadAuthorized(
      actingUserId,
      id,
      "event.transition_status",
    );

    if (!canTransition(event.status, target)) {
      throw eventInvalidTransition(event.status, target);
    }

    const result = await this.repository.updateStatus(id, event.status, target);
    if (result === "not_found") {
      throw eventNotFound();
    }
    if (result === "status_changed") {
      // Another request moved the event after we read it. Report the move
      // that is no longer legal against the status it now has.
      const current = await this.repository.findById(id);
      if (!current) throw eventNotFound();
      throw eventInvalidTransition(current.status, target);
    }
    return toEventResponse(result);
  }

  async setManager(
    actingUserId: string,
    id: string,
    managerId: string | null,
  ): Promise<EventResponse> {
    const event = await this.loadAuthorized(
      actingUserId,
      id,
      "event.assign_manager",
    );

    const result = await this.workspaces.setManager(
      event.workspaceId,
      managerId,
    );
    if (result === "not_found") {
      throw eventNotFound();
    }
    if (result === "manager_not_found") {
      throw eventUserNotFound();
    }
    return this.reload(id);
  }

  async assignTeam(
    actingUserId: string,
    id: string,
    teamId: string,
  ): Promise<EventResponse> {
    const event = await this.loadAuthorized(
      actingUserId,
      id,
      "event.assign_teams",
    );

    const result = await this.workspaces.assignTeam(event.workspaceId, teamId);
    if (result === "workspace_not_found") {
      throw eventNotFound();
    }
    if (result === "team_not_found") {
      throw eventTeamNotFound();
    }
    return this.reload(id);
  }

  async unassignTeam(
    actingUserId: string,
    id: string,
    teamId: string,
  ): Promise<EventResponse> {
    const event = await this.loadAuthorized(
      actingUserId,
      id,
      "event.assign_teams",
    );

    const result = await this.workspaces.unassignTeam(
      event.workspaceId,
      teamId,
    );
    if (result === "workspace_not_found") {
      throw eventNotFound();
    }
    if (result === "not_assigned") {
      throw eventTeamNotAssigned();
    }
    return this.reload(id);
  }

  async getBudget(
    actingUserId: string,
    id: string,
  ): Promise<EventBudgetResponse> {
    const event = await this.loadAuthorized(
      actingUserId,
      id,
      "event.budget.read",
    );
    return { amount: event.budgetAmount, currency: event.budgetCurrency };
  }

  async getBudgetSummary(
    actingUserId: string,
    id: string,
  ): Promise<EventBudgetSummaryResponse> {
    await this.loadAuthorized(actingUserId, id, "event.budget.read");
    const summary = await this.repository.budgetSummary(id);
    if (!summary) throw eventNotFound();
    return summary;
  }

  async setBudget(
    actingUserId: string,
    id: string,
    dto: SetEventBudgetDto,
  ): Promise<EventBudgetResponse> {
    await this.loadAuthorized(actingUserId, id, "event.budget.update");

    if ((dto.amount === null) !== (dto.currency === null)) {
      throw eventBudgetIncomplete();
    }

    const amount = dto.amount === null ? null : dto.amount.toFixed(2);
    const result = await this.repository.setBudget(id, amount, dto.currency);
    if (result === "not_found") {
      throw eventNotFound();
    }
    return { amount: result.budgetAmount, currency: result.budgetCurrency };
  }

  async remove(actingUserId: string, id: string): Promise<void> {
    await this.loadAuthorized(actingUserId, id, "event.delete");

    const result = await this.repository.delete(id);
    if (result === "not_found") {
      throw eventNotFound();
    }
    if (result === "has_managed_files") {
      throw eventHasManagedFiles();
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
    throw eventScheduleInvalid();
  }
}

function toEventResponse(record: EventRecord): EventResponse {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    name: record.name,
    eventType: record.eventType,
    description: record.description,
    status: record.status,
    startAt: record.startAt ? record.startAt.toISOString() : null,
    endAt: record.endAt ? record.endAt.toISOString() : null,
    location: record.location,
    organizerName: record.organizerName,
    departmentId: record.departmentId,
    manager: record.manager,
    teams: record.teams,
    participants: record.participants,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
