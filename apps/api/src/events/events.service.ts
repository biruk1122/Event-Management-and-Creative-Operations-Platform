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
} from "./infrastructure/events.repository.js";

/**
 * Application service for event management: the precise authorization boundary
 * (the transport guard only checked that the caller holds the `event.*` key at
 * some scope), the lifecycle and schedule policy, and the mapping from
 * persistence records to public response shapes.
 *
 * Every event route is for a known `kind = EVENT`, so the static
 * `@RequirePermissions` on the controller names the exact key and this service
 * re-checks it at ORGANIZATION scope - matching WSP-02, where organization scope
 * is the boundary for every connected-workspace operation. Manager and team
 * assignment reuse `WorkspacesRepository` so that composition logic
 * (idempotency, "not assigned") lives in one place; the workspace row lifecycle
 * (create with the event, delete with it) lives in `EventsRepository`, the
 * pairing EVT-01 assigned here. The budget is sensitive (PC-04) and is reachable
 * only through the two budget routes and their own keys.
 */
@Injectable()
export class EventsService {
  constructor(
    private readonly repository: EventsRepository,
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

  /** Loads an event or throws 404; used before a permission check on `:id` routes. */
  private async loadOrThrow(id: string): Promise<EventRecord> {
    const event = await this.repository.findById(id);
    if (!event) {
      throw eventNotFound();
    }
    return event;
  }

  /** Re-reads an event that must exist; a `null` here means it was raced away. */
  private async reload(id: string): Promise<EventResponse> {
    const event = await this.repository.findById(id);
    if (!event) {
      throw eventNotFound();
    }
    return toEventResponse(event);
  }

  async list(
    actingUserId: string,
    query: ListEventsQueryDto,
  ): Promise<PaginatedEventsResponse> {
    await this.requireGrant(actingUserId, "event.read");

    const { items, total } = await this.repository.list({
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
    const event = await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "event.read");
    return toEventResponse(event);
  }

  async create(
    actingUserId: string,
    dto: CreateEventDto,
  ): Promise<EventResponse> {
    await this.requireGrant(actingUserId, "event.create");

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
    const event = await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "event.update");

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
    const event = await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "event.transition_status");

    if (!canTransition(event.status, target)) {
      throw eventInvalidTransition(event.status, target);
    }

    const result = await this.repository.updateStatus(id, target);
    if (result === "not_found") {
      throw eventNotFound();
    }
    return toEventResponse(result);
  }

  async setManager(
    actingUserId: string,
    id: string,
    managerId: string | null,
  ): Promise<EventResponse> {
    const event = await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "event.assign_manager");

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
    const event = await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "event.assign_teams");

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
    const event = await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "event.assign_teams");

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
    const event = await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "event.budget.read");
    return { amount: event.budgetAmount, currency: event.budgetCurrency };
  }

  async setBudget(
    actingUserId: string,
    id: string,
    dto: SetEventBudgetDto,
  ): Promise<EventBudgetResponse> {
    await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "event.budget.update");

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
    await this.loadOrThrow(id);
    await this.requireGrant(actingUserId, "event.delete");

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
    manager: record.manager,
    teams: record.teams,
    participants: record.participants,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
