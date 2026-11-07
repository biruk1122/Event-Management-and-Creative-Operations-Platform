import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import {
  AuditActorKind,
  AuditOutcome,
  type EventStatus,
  type PermissionScope,
} from "../generated/prisma/client.js";
import { AuditReaderService } from "../audit/audit-reader.service.js";
import { AuditWriterService } from "../audit/audit-writer.service.js";
import type {
  AppendAuditRecordInput,
  SupportedAuditAction,
} from "../audit/audit.types.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { WorkspacesRepository } from "../workspaces/infrastructure/workspaces.repository.js";
import type {
  EventBudgetResponse,
  EventActivityResponse,
  EventBudgetSummaryResponse,
  EventMilestoneResponse,
  EventOverviewResponse,
  EventPersonSummary,
  EventProgress,
  EventResponse,
  EventSummaryResponse,
  PaginatedEventsResponse,
} from "./events.contracts.js";
import {
  eventBudgetIncomplete,
  eventHasManagedFiles,
  eventInvalidTransition,
  eventMilestoneNotFound,
  eventNotFound,
  eventReminderInvalid,
  eventScheduleInvalid,
  eventTeamNotAssigned,
  eventTeamNotFound,
  eventUserNotFound,
  eventTeamDeactivated,
} from "./events.errors.js";
import { canTransition } from "./events.lifecycle.js";
import type { CreateEventDto } from "./dto/create-event.dto.js";
import type {
  CreateEventMilestoneDto,
  UpdateEventMilestoneDto,
} from "./dto/event-milestone.dto.js";
import type { ListEventsQueryDto } from "./dto/list-events-query.dto.js";
import {
  TalentAssignmentsService,
  type TalentAssignmentView,
} from "../talent/talent-assignments.service.js";
import type { EventTalentSummary } from "../talent/infrastructure/talent-assignments.repository.js";
import type { AssignEventTalentDto } from "./dto/assign-event-talent.dto.js";
import type {
  EventStaffNameResponse,
  EventTalentAssignmentResponse,
  EventTeamResponse,
} from "./events-workspace.contracts.js";
import type { SetEventBudgetDto } from "./dto/set-event-budget.dto.js";
import type { UpdateEventDto } from "./dto/update-event.dto.js";
import {
  EventsRepository,
  type EventMilestoneRecord,
  type EventRecord,
  type EventVisibility,
} from "./infrastructure/events.repository.js";

/** Event actions. Visible to every caller who can read the event. */
const EVENT_ONLY_ACTIVITY_ACTIONS: readonly SupportedAuditAction[] = [
  "event.created",
  "event.updated",
  "event.status_changed",
  "event.manager_changed",
  "event.team_assigned",
  "event.team_removed",
  "event.budget_changed",
  "event.milestone.created",
  "event.milestone.updated",
  "event.milestone.deleted",
];

/** Task actions. Shown only for the tasks the caller may read. */
const TASK_ACTIVITY_ACTIONS: readonly SupportedAuditAction[] = [
  "task.assignee_added",
  "task.assignee_removed",
  "task.submitted_for_review",
  "task.review.approved",
  "task.review.changes_requested",
];

/** Talent assignment actions. Shown only to callers who can read talent. */
const TALENT_ACTIVITY_ACTIONS: readonly SupportedAuditAction[] = [
  "talent.assignment.created",
  "talent.assignment.updated",
  "talent.assignment.completed",
  "talent.assignment.cancelled",
];

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
    private readonly talentAssignments: TalentAssignmentsService,
    private readonly auditWriter: AuditWriterService,
    private readonly auditReader: AuditReaderService,
  ) {}

  /** Audits a change made through the shared workspace repository, which has
   * no event transaction to join. */
  private recordWorkspaceChange(
    event: EventRecord,
    actorUserId: string,
    requestId: string,
    action: AppendAuditRecordInput["action"],
  ): Promise<void> {
    return this.auditWriter.record({
      action,
      actorKind: AuditActorKind.USER,
      actorUserId,
      requestId,
      outcome: AuditOutcome.SUCCEEDED,
      resourceType: "event",
      resourceId: event.id,
      workspaceContext: event.workspaceId,
    });
  }

  private async hasGrant(
    actingUserId: string,
    permissionKey: string,
    scope: PermissionScope,
  ): Promise<boolean> {
    return this.permissions.hasGrant(actingUserId, permissionKey, scope);
  }

  /** Passes when the caller holds the key at any scope; used where the event
   * does not exist yet, so there is no record to scope against. */
  private async requireAnyScope(
    actingUserId: string,
    permissionKey: string,
  ): Promise<void> {
    const allowed =
      (await this.hasGrant(actingUserId, permissionKey, "ORGANIZATION")) ||
      (await this.hasGrant(actingUserId, permissionKey, "DEPARTMENT"));
    if (!allowed) throw permissionDenied();
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
    return this.single(event);
  }

  /** Builds public responses, attaching each event's task progress in one
   * aggregate query rather than one query per event. */
  private async respond(records: EventRecord[]): Promise<EventResponse[]> {
    const progress = await this.repository.taskProgressFor(
      records.map((record) => record.id),
    );
    return records.map((record) =>
      toEventResponse(record, progress.get(record.id) ?? ZERO_PROGRESS),
    );
  }

  private async single(record: EventRecord): Promise<EventResponse> {
    return (await this.respond([record]))[0]!;
  }

  /** Headline counts for the listing tiles, over the caller's visible events. */
  async summary(actingUserId: string): Promise<EventSummaryResponse> {
    const visibility = await this.visibilityFor(actingUserId, "event.read");
    return this.repository.summary(visibility, new Date());
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
      ...(query.teamId ? { teamId: query.teamId } : {}),
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
      ...(query.startingAfter
        ? { startingAfter: new Date(query.startingAfter) }
        : {}),
      ...(query.startingBefore
        ? { startingBefore: new Date(query.startingBefore) }
        : {}),
      ...(query.sort
        ? {
            sort: {
              field: query.sort,
              direction: query.direction ?? "asc",
            },
          }
        : {}),
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      items: await this.respond(items),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(actingUserId: string, id: string): Promise<EventResponse> {
    return this.single(
      await this.loadAuthorized(actingUserId, id, "event.read"),
    );
  }

  async create(
    actingUserId: string,
    dto: CreateEventDto,
    requestId: string = randomUUID(),
  ): Promise<EventResponse> {
    const visibility = await this.visibilityFor(actingUserId, "event.create");

    // Teams and budget are separate permissions; a creator without them may
    // not set them on creation, even though they may create the event.
    if ((dto.teamIds?.length ?? 0) > 0) {
      await this.requireAnyScope(actingUserId, "event.assign_teams");
    }
    if (dto.budgetAmount !== undefined || dto.budgetCurrency !== undefined) {
      await this.requireAnyScope(actingUserId, "event.budget.update");
    }
    if (dto.budgetCurrency !== undefined && dto.budgetAmount === undefined) {
      throw eventBudgetIncomplete();
    }

    const startAt = dto.startAt ? new Date(dto.startAt) : undefined;
    const endAt = dto.endAt ? new Date(dto.endAt) : undefined;
    const reminderAt = dto.reminderAt ? new Date(dto.reminderAt) : undefined;
    assertScheduleOrdered(startAt ?? null, endAt ?? null);
    assertReminderBeforeStart(reminderAt ?? null, startAt ?? null);

    const result = await this.repository.create(
      {
        name: dto.name.trim(),
        eventType: dto.eventType,
        createdById: actingUserId,
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(startAt ? { startAt } : {}),
        ...(endAt ? { endAt } : {}),
        ...(reminderAt ? { reminderAt } : {}),
        ...(dto.location !== undefined
          ? { location: dto.location.trim() }
          : {}),
        ...(dto.organizerName !== undefined
          ? { organizerName: dto.organizerName.trim() }
          : {}),
        ...(dto.managerId ? { managerId: dto.managerId } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.teamIds?.length ? { teamIds: dto.teamIds } : {}),
        ...(dto.budgetAmount !== undefined
          ? {
              budget: {
                amount: dto.budgetAmount,
                currency: dto.budgetCurrency ?? "ETB",
              },
            }
          : {}),
        // A department-scoped creator's event is scoped to their own
        // department (never from client input); an organization-scoped
        // creator leaves it unset (decision 2: no department is ever guessed).
        ...(!visibility.organization && visibility.departmentId
          ? { departmentId: visibility.departmentId }
          : {}),
      },
      { actorUserId: actingUserId, requestId },
    );

    if (result === "manager_not_found") {
      throw eventUserNotFound();
    }
    if (result === "team_not_found") {
      throw eventTeamNotFound();
    }
    return this.single(result);
  }

  async update(
    actingUserId: string,
    id: string,
    dto: UpdateEventDto,
    requestId: string = randomUUID(),
  ): Promise<EventResponse> {
    const event = await this.loadAuthorized(actingUserId, id, "event.update");

    const nextStart = resolveInstant(dto.startAt, event.startAt);
    const nextEnd = resolveInstant(dto.endAt, event.endAt);
    const nextReminder = resolveInstant(dto.reminderAt, event.reminderAt);
    assertScheduleOrdered(nextStart, nextEnd);
    assertReminderBeforeStart(nextReminder, nextStart);

    const result = await this.repository.update(
      id,
      {
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
        ...(dto.reminderAt !== undefined
          ? {
              reminderAt:
                dto.reminderAt === null ? null : new Date(dto.reminderAt),
            }
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
      },
      { actorUserId: actingUserId, requestId },
    );

    if (result === "not_found") {
      throw eventNotFound();
    }
    return this.single(result);
  }

  async transition(
    actingUserId: string,
    id: string,
    target: EventStatus,
    requestId: string = randomUUID(),
  ): Promise<EventResponse> {
    const event = await this.loadAuthorized(
      actingUserId,
      id,
      "event.transition_status",
    );

    if (!canTransition(event.status, target)) {
      throw eventInvalidTransition(event.status, target);
    }

    const result = await this.repository.updateStatus(
      id,
      event.status,
      target,
      { actorUserId: actingUserId, requestId },
    );
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
    return this.single(result);
  }

  async setManager(
    actingUserId: string,
    id: string,
    managerId: string | null,
    requestId: string = randomUUID(),
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
    if ((event.manager?.id ?? null) !== managerId) {
      await this.recordWorkspaceChange(
        event,
        actingUserId,
        requestId,
        "event.manager_changed",
      );
    }
    return this.reload(id);
  }

  async assignTeam(
    actingUserId: string,
    id: string,
    teamId: string,
    requestId: string = randomUUID(),
  ): Promise<EventResponse> {
    const event = await this.loadAuthorized(
      actingUserId,
      id,
      "event.assign_teams",
    );

    const alreadyAssigned = event.teams.some((team) => team.id === teamId);
    if (!alreadyAssigned) {
      // A deactivated team keeps its history but cannot take on new events.
      const status = await this.repository.teamStatus(teamId);
      if (status === "not_found") {
        throw eventTeamNotFound();
      }
      if (status === "deactivated") {
        throw eventTeamDeactivated();
      }
    }

    const result = await this.workspaces.assignTeam(event.workspaceId, teamId);
    if (result === "workspace_not_found") {
      throw eventNotFound();
    }
    if (result === "team_not_found") {
      throw eventTeamNotFound();
    }
    if (!alreadyAssigned) {
      await this.recordWorkspaceChange(
        event,
        actingUserId,
        requestId,
        "event.team_assigned",
      );
    }
    return this.reload(id);
  }

  async unassignTeam(
    actingUserId: string,
    id: string,
    teamId: string,
    requestId: string = randomUUID(),
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
    await this.recordWorkspaceChange(
      event,
      actingUserId,
      requestId,
      "event.team_removed",
    );
    return this.reload(id);
  }

  /**
   * The event's teams. Members are included only for callers who can read teams
   * (organization-wide, or the team's own department), so event readers do not
   * learn about other departments' people.
   */
  async eventTeams(
    actingUserId: string,
    id: string,
  ): Promise<EventTeamResponse[]> {
    const event = await this.loadAuthorized(actingUserId, id, "event.read");
    const rows = await this.repository.eventTeamRows(event.id);
    const teamOrg = await this.hasGrant(
      actingUserId,
      "team.read",
      "ORGANIZATION",
    );
    const teamDept = await this.hasGrant(
      actingUserId,
      "team.read",
      "DEPARTMENT",
    );
    const callerDepartment =
      teamDept && !teamOrg
        ? await this.repository.findUserDepartmentId(actingUserId)
        : null;
    return rows.map((team) => {
      const membersVisible =
        teamOrg || (teamDept && callerDepartment === team.department.id);
      return {
        id: team.id,
        name: team.name,
        description: team.description,
        department: team.department,
        manager:
          membersVisible && team.manager ? personSummary(team.manager) : null,
        membersVisible,
        members: membersVisible
          ? team.members.map((member) => personSummary(member.user))
          : [],
      };
    });
  }

  /** The talents assigned to this event, with the talent-side visibility rules. */
  async eventTalents(
    actingUserId: string,
    id: string,
  ): Promise<EventTalentAssignmentResponse[]> {
    const event = await this.loadAuthorized(actingUserId, id, "event.read");
    const rows = await this.talentAssignments.listForEvent(
      actingUserId,
      event.id,
    );
    return rows.map(toEventTalentAssignment);
  }

  /**
   * Assigns a talent to this event. The talent module's own service does the
   * work, including the conflict check, override authorization and audit.
   */
  async assignEventTalent(
    actingUserId: string,
    id: string,
    body: AssignEventTalentDto,
    requestId: string = randomUUID(),
  ): Promise<EventTalentAssignmentResponse> {
    const event = await this.loadAuthorized(actingUserId, id, "event.read");
    // Unset window fields stay unset, so the work's own dates apply as usual.
    const { talentId, ...assignment } = body;
    const created = await this.talentAssignments.create(
      actingUserId,
      talentId,
      { ...assignment, kind: "EVENT", workId: event.id },
      requestId,
    );
    // Read the new row back through the same visibility rule, so the response
    // carries the talent summary. The caller just created it, so it is visible.
    const row = (
      await this.talentAssignments.listForEvent(actingUserId, event.id)
    ).find((item) => item.id === created.id);
    if (!row) {
      throw new Error("A created talent assignment is missing from its event");
    }
    return toEventTalentAssignment(row);
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
    requestId: string = randomUUID(),
  ): Promise<EventBudgetResponse> {
    await this.loadAuthorized(actingUserId, id, "event.budget.update");

    if ((dto.amount === null) !== (dto.currency === null)) {
      throw eventBudgetIncomplete();
    }

    const amount = dto.amount === null ? null : dto.amount.toFixed(2);
    const result = await this.repository.setBudget(id, amount, dto.currency, {
      actorUserId: actingUserId,
      requestId,
    });
    if (result === "not_found") {
      throw eventNotFound();
    }
    return { amount: result.budgetAmount, currency: result.budgetCurrency };
  }

  /** The figures behind the workspace Overview tiles. */
  async overview(
    actingUserId: string,
    id: string,
  ): Promise<EventOverviewResponse> {
    return this.repository.overview(
      await this.loadAuthorized(actingUserId, id, "event.read"),
    );
  }

  /** The event's activity feed, read from the audit log. Only the allowlisted
   * actions appear, and raw metadata never leaves the service. */
  async activity(
    actingUserId: string,
    id: string,
    limit: number,
  ): Promise<EventActivityResponse[]> {
    const event = await this.loadAuthorized(actingUserId, id, "event.read");

    // Task lines follow the tasks module's own rule. Organization sees every
    // linked task, department sees tasks in the caller's department, and self
    // sees tasks the caller is assigned to or created. A caller with no task
    // scope sees no task lines.
    const [taskOrg, taskDept, taskSelf, talentOrg, talentDept, talentSelf] =
      await Promise.all([
        this.hasGrant(actingUserId, "task.read", "ORGANIZATION"),
        this.hasGrant(actingUserId, "task.read", "DEPARTMENT"),
        this.hasGrant(actingUserId, "task.read", "SELF"),
        this.hasGrant(actingUserId, "talent.read", "ORGANIZATION"),
        this.hasGrant(actingUserId, "talent.read", "DEPARTMENT"),
        this.hasGrant(actingUserId, "talent.read", "SELF"),
      ]);
    const canSeeTasks = taskOrg || taskDept || taskSelf;
    const canSeeTalent = talentOrg || talentDept || talentSelf;
    const taskIds = canSeeTasks
      ? await this.repository.visibleLinkedTaskIds(event.id, {
          organization: taskOrg,
          departmentId:
            taskDept && !taskOrg
              ? await this.repository.findUserDepartmentId(actingUserId)
              : null,
          selfUserId: taskSelf && !taskOrg ? actingUserId : null,
        })
      : [];

    const records = await this.auditReader.listWorkActivity({
      workspaceId: event.workspaceId,
      eventActions: EVENT_ONLY_ACTIVITY_ACTIONS,
      taskActions: canSeeTasks ? TASK_ACTIVITY_ACTIONS : [],
      taskIds,
      talentActions: canSeeTalent ? TALENT_ACTIVITY_ACTIONS : [],
      workId: event.id,
      limit,
    });
    const people = await this.repository.peopleByIds([
      ...new Set(
        records.flatMap((record) =>
          record.actorUserId ? [record.actorUserId] : [],
        ),
      ),
    ]);
    return records.map((record) => ({
      id: record.id,
      action: record.action,
      occurredAt: record.occurredAt.toISOString(),
      actor: record.actorUserId
        ? (people.get(record.actorUserId) ?? null)
        : null,
      subject: activitySubject(record.metadata),
    }));
  }

  async listMilestones(
    actingUserId: string,
    id: string,
  ): Promise<EventMilestoneResponse[]> {
    await this.loadAuthorized(actingUserId, id, "event.read");
    const milestones = await this.repository.listMilestones(id);
    return milestones.map(toMilestoneResponse);
  }

  async createMilestone(
    actingUserId: string,
    id: string,
    dto: CreateEventMilestoneDto,
    requestId: string,
  ): Promise<EventMilestoneResponse> {
    const event = await this.loadAuthorized(actingUserId, id, "event.update");
    return toMilestoneResponse(
      await this.repository.createMilestone(
        event,
        {
          name: dto.name.trim(),
          dueDate: new Date(dto.dueDate),
          ...(dto.description !== undefined
            ? { description: dto.description.trim() }
            : {}),
          ...(dto.status ? { status: dto.status } : {}),
        },
        { actorUserId: actingUserId, requestId },
      ),
    );
  }

  async updateMilestone(
    actingUserId: string,
    id: string,
    milestoneId: string,
    dto: UpdateEventMilestoneDto,
    requestId: string,
  ): Promise<EventMilestoneResponse> {
    const event = await this.loadAuthorized(actingUserId, id, "event.update");
    const result = await this.repository.updateMilestone(
      event,
      milestoneId,
      {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? {
              description:
                dto.description === null ? null : dto.description.trim(),
            }
          : {}),
        ...(dto.dueDate !== undefined
          ? { dueDate: new Date(dto.dueDate) }
          : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
      { actorUserId: actingUserId, requestId },
    );
    if (result === "not_found") throw eventMilestoneNotFound();
    return toMilestoneResponse(result);
  }

  async deleteMilestone(
    actingUserId: string,
    id: string,
    milestoneId: string,
    requestId: string,
  ): Promise<void> {
    const event = await this.loadAuthorized(actingUserId, id, "event.update");
    const result = await this.repository.deleteMilestone(event, milestoneId, {
      actorUserId: actingUserId,
      requestId,
    });
    if (result === "not_found") throw eventMilestoneNotFound();
  }

  async remove(
    actingUserId: string,
    id: string,
    requestId: string,
  ): Promise<void> {
    await this.loadAuthorized(actingUserId, id, "event.delete");

    const result = await this.repository.delete(
      id,
      this.talentAssignments.archiveHook(actingUserId, requestId),
    );
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

/** A reminder is meaningless without a start time, and can never be later
 * than it - mirrors `meetings.service.ts`'s own reminder/start check. */
function assertReminderBeforeStart(
  reminderAt: Date | null,
  startAt: Date | null,
): void {
  if (reminderAt && (!startAt || reminderAt.getTime() > startAt.getTime())) {
    throw eventReminderInvalid();
  }
}

const ZERO_PROGRESS: EventProgress = { completed: 0, total: 0 };

/** Staff are named by display name only on the event surface. */
function staffName(
  person: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  } | null,
): EventStaffNameResponse | null {
  if (!person) return null;
  const displayName = [person.firstName, person.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return { id: person.id, displayName: displayName || "Staff member" };
}

function toEventTalentAssignment(
  row: TalentAssignmentView & { talent: EventTalentSummary },
): EventTalentAssignmentResponse {
  const { assignedBy, cancelledBy, ...rest } = row;
  return {
    ...rest,
    assignedBy: staffName(assignedBy),
    cancelledBy: staffName(cancelledBy),
  };
}

function personSummary(person: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}): EventPersonSummary {
  return {
    id: person.id,
    email: person.email,
    firstName: person.firstName,
    lastName: person.lastName,
  };
}

/** The one safe detail an activity line may show: a milestone name or the
 * status an event moved to. */
function activitySubject(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const { milestoneName, to } = metadata as Record<string, unknown>;
  if (typeof milestoneName === "string") return milestoneName;
  return typeof to === "string" ? to : null;
}

function toMilestoneResponse(
  record: EventMilestoneRecord,
): EventMilestoneResponse {
  return {
    id: record.id,
    eventId: record.eventId,
    name: record.name,
    description: record.description,
    dueDate: record.dueDate.toISOString().slice(0, 10),
    status: record.status,
    createdBy: record.createdBy,
    updatedBy: record.updatedBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toEventResponse(
  record: EventRecord,
  progress: EventProgress,
): EventResponse {
  return {
    id: record.id,
    eventNumber: record.eventNumber,
    workspaceId: record.workspaceId,
    name: record.name,
    eventType: record.eventType,
    description: record.description,
    status: record.status,
    startAt: record.startAt ? record.startAt.toISOString() : null,
    endAt: record.endAt ? record.endAt.toISOString() : null,
    reminderAt: record.reminderAt ? record.reminderAt.toISOString() : null,
    location: record.location,
    organizerName: record.organizerName,
    departmentId: record.departmentId,
    manager: record.manager,
    teams: record.teams,
    participants: record.participants,
    createdBy: record.createdBy,
    progress,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
