import type { ArchiveHook } from "../../common/archive/archive-hook.js";
import { Injectable } from "@nestjs/common";

import {
  AuditActorKind,
  AuditOutcome,
  Prisma,
  WorkspaceKind,
  type EventMilestoneStatus,
  type EventStatus,
  type EventType,
} from "../../generated/prisma/client.js";
import { AuditWriterService } from "../../audit/audit-writer.service.js";
import type { AppendAuditRecordInput } from "../../audit/audit.types.js";
import { DatabaseService } from "../../database/database.service.js";

/** Thrown inside the create transaction to roll it back when a requested team
 * does not exist; converted to a `"team_not_found"` outcome. */
class TeamNotFoundOutcome extends Error {}

function orderByFor(
  sort: ListEventsInput["sort"],
): Prisma.EventOrderByWithRelationInput[] {
  const direction = sort?.direction ?? "asc";
  switch (sort?.field) {
    case "startAt":
      return [{ startAt: { sort: direction, nulls: "last" } }, { id: "asc" }];
    case "name":
      return [{ name: direction }, { id: "asc" }];
    case "status":
      return [{ status: direction }, { id: "asc" }];
    default:
      // `id` (uuidv7) is the tiebreaker so pagination stays deterministic.
      return [{ createdAt: direction }, { id: "asc" }];
  }
}

export interface EventPersonRecord {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface EventTeamRecord {
  id: string;
  name: string;
}

/**
 * The event's own columns plus the composition of its connected workspace read
 * through the 1:1 relation - the manager, assigned teams, and assigned
 * participants that WSP-01 anchors on the workspace. `budgetAmount` /
 * `budgetCurrency` are carried so the service can serve them through the
 * sensitive budget routes only.
 */
export interface EventRecord {
  id: string;
  eventNumber: number;
  workspaceId: string;
  name: string;
  eventType: EventType;
  description: string | null;
  status: EventStatus;
  startAt: Date | null;
  endAt: Date | null;
  reminderAt: Date | null;
  location: string | null;
  organizerName: string | null;
  departmentId: string | null;
  budgetAmount: string | null;
  budgetCurrency: string | null;
  manager: EventPersonRecord | null;
  teams: EventTeamRecord[];
  participants: EventPersonRecord[];
  createdBy: EventPersonRecord | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Mirrors `TaskVisibility`/`ReportVisibility`: a `departmentId` scopes an
 * event to the manager's own department (EOM-01); a pre-existing event with
 * no department is visible only to an organization-scoped caller. */
export interface EventVisibility {
  organization: boolean;
  departmentId?: string;
}

export interface ListEventsInput {
  visibility: EventVisibility;
  status?: EventStatus;
  eventType?: EventType;
  managerId?: string;
  search?: string;
  startingAfter?: Date;
  startingBefore?: Date;
  sort?: {
    field: "startAt" | "name" | "status" | "createdAt";
    direction: "asc" | "desc";
  };
  page: number;
  pageSize: number;
}

export interface CreateEventInput {
  name: string;
  eventType: EventType;
  description?: string;
  startAt?: Date;
  endAt?: Date;
  reminderAt?: Date;
  location?: string;
  organizerName?: string;
  managerId?: string;
  createdById: string;
  departmentId?: string;
  /** Starting state; the service admits only PLANNING or READY. */
  status?: EventStatus;
  /** Teams to assign to the event's connected workspace in the same transaction. */
  teamIds?: string[];
  /** Planned budget, stored with its currency (ETB by default). */
  budget?: { amount: number; currency: string };
}

/** Who is acting, for the audit record written with a change. */
export interface EventAuditContext {
  actorUserId: string;
  requestId: string;
}

export interface EventMilestoneRecord {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  dueDate: Date;
  status: EventMilestoneStatus;
  createdBy: EventPersonRecord | null;
  updatedBy: EventPersonRecord | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventMilestoneFields {
  name?: string;
  description?: string | null;
  dueDate?: Date;
  status?: EventMilestoneStatus;
}

export interface EventOverviewRecord {
  tasks: { total: number; completed: number; awaitingReview: number };
  teams: { count: number; people: number };
  milestones: { total: number; completed: number };
}

export interface EventBudgetSummary {
  plannedAmount: string | null;
  currency: string | null;
  actualApproved: string;
  actualPending: string;
}

export interface UpdateEventFields {
  name?: string;
  eventType?: EventType;
  description?: string | null;
  startAt?: Date | null;
  endAt?: Date | null;
  reminderAt?: Date | null;
  location?: string | null;
  organizerName?: string | null;
}

const PRISMA_ERROR = {
  uniqueViolation: "P2002",
  foreignKeyViolation: "P2003",
  recordNotFound: "P2025",
} as const;

function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The `:id` path segment arrives as a raw string. A value that is not a UUID
 * cannot match any row, and handing it to a `@db.Uuid` column makes the driver
 * raise `22P02`, which would surface as a 500. Treating it as "no such row"
 * keeps those routes returning a clean not-found.
 */
function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

const PERSON_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

const MILESTONE_SELECT = {
  id: true,
  eventId: true,
  name: true,
  description: true,
  dueDate: true,
  status: true,
  createdBy: { select: PERSON_SELECT },
  updatedBy: { select: PERSON_SELECT },
  createdAt: true,
  updatedAt: true,
} as const;

/** Bounds for reads with no paging: far above any real event. */
const MILESTONE_LIMIT = 200;
const RELATED_TASK_LIMIT = 500;

const EVENT_SELECT = {
  id: true,
  eventNumber: true,
  workspaceId: true,
  name: true,
  eventType: true,
  description: true,
  status: true,
  startAt: true,
  endAt: true,
  reminderAt: true,
  location: true,
  organizerName: true,
  departmentId: true,
  budgetAmount: true,
  budgetCurrency: true,
  createdBy: { select: PERSON_SELECT },
  createdAt: true,
  updatedAt: true,
  workspace: {
    select: {
      manager: { select: PERSON_SELECT },
      teams: { select: { team: { select: { id: true, name: true } } } },
      participants: { select: { user: { select: PERSON_SELECT } } },
    },
  },
} as const;

type RawEvent = Prisma.EventGetPayload<{ select: typeof EVENT_SELECT }>;

function byName(a: EventTeamRecord, b: EventTeamRecord): number {
  return a.name.localeCompare(b.name);
}

function byPerson(a: EventPersonRecord, b: EventPersonRecord): number {
  return (
    (a.lastName ?? "").localeCompare(b.lastName ?? "") ||
    (a.firstName ?? "").localeCompare(b.firstName ?? "") ||
    a.email.localeCompare(b.email)
  );
}

function toRecord(raw: RawEvent): EventRecord {
  return {
    id: raw.id,
    eventNumber: raw.eventNumber,
    workspaceId: raw.workspaceId,
    name: raw.name,
    eventType: raw.eventType,
    description: raw.description,
    status: raw.status,
    startAt: raw.startAt,
    endAt: raw.endAt,
    reminderAt: raw.reminderAt,
    location: raw.location,
    organizerName: raw.organizerName,
    departmentId: raw.departmentId,
    budgetAmount:
      raw.budgetAmount === null ? null : raw.budgetAmount.toFixed(2),
    // A `@db.Char(3)` reads back space-padded; the CHECK guarantees three
    // letters, so trimming is safe and keeps the contract clean.
    budgetCurrency:
      raw.budgetCurrency === null ? null : raw.budgetCurrency.trim(),
    manager: raw.workspace.manager ?? null,
    teams: raw.workspace.teams
      .map((assignment) => assignment.team)
      .sort(byName),
    participants: raw.workspace.participants
      .map((participation) => participation.user)
      .sort(byPerson),
    createdBy: raw.createdBy ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function visibleWhere(visibility: EventVisibility): Prisma.EventWhereInput {
  if (visibility.organization) return {};
  return visibility.departmentId
    ? { departmentId: visibility.departmentId }
    : { id: { in: [] } };
}

/** Only the keys the caller actually set, so a patch never nulls a field by omission. */
function updateData(fields: UpdateEventFields): Prisma.EventUpdateInput {
  const data: Prisma.EventUpdateInput = {};
  if (fields.name !== undefined) data.name = fields.name;
  if (fields.eventType !== undefined) data.eventType = fields.eventType;
  if (fields.description !== undefined) data.description = fields.description;
  if (fields.startAt !== undefined) data.startAt = fields.startAt;
  if (fields.endAt !== undefined) data.endAt = fields.endAt;
  if (fields.reminderAt !== undefined) data.reminderAt = fields.reminderAt;
  if (fields.location !== undefined) data.location = fields.location;
  if (fields.organizerName !== undefined) {
    data.organizerName = fields.organizerName;
  }
  return data;
}

@Injectable()
export class EventsRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditWriterService,
  ) {}

  /** Appends an event audit record inside the change's own transaction. */
  private appendAudit(
    tx: Prisma.TransactionClient,
    context: EventAuditContext | undefined,
    record: Pick<
      AppendAuditRecordInput,
      "action" | "resourceType" | "resourceId" | "metadata"
    > & { workspaceId: string },
  ): Promise<void> {
    if (!context) return Promise.resolve();
    const { workspaceId, ...entry } = record;
    return this.audit.append(tx, {
      ...entry,
      actorKind: AuditActorKind.USER,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      outcome: AuditOutcome.SUCCEEDED,
      workspaceContext: workspaceId,
    });
  }

  async findUserDepartmentId(userId: string): Promise<string | null> {
    if (!isUuid(userId)) return null;
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    return user?.departmentId ?? null;
  }

  async list(
    input: ListEventsInput,
  ): Promise<{ items: EventRecord[]; total: number }> {
    const startAt =
      input.startingAfter || input.startingBefore
        ? {
            ...(input.startingAfter ? { gte: input.startingAfter } : {}),
            ...(input.startingBefore ? { lte: input.startingBefore } : {}),
          }
        : undefined;

    const where: Prisma.EventWhereInput = {
      ...visibleWhere(input.visibility),
      archivedAt: null,
      ...(input.status ? { status: input.status } : {}),
      ...(input.eventType ? { eventType: input.eventType } : {}),
      ...(input.managerId ? { workspace: { managerId: input.managerId } } : {}),
      ...(input.search
        ? { name: { contains: input.search, mode: "insensitive" } }
        : {}),
      ...(startAt ? { startAt } : {}),
    };

    const [items, total] = await Promise.all([
      this.db.event.findMany({
        where,
        select: EVENT_SELECT,
        // `id` (uuidv7) is the tiebreaker so pagination stays deterministic
        // when two events share a `created_at` value.
        orderBy: orderByFor(input.sort),
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.event.count({ where }),
    ]);

    return { items: items.map(toRecord), total };
  }

  async findById(id: string): Promise<EventRecord | null> {
    if (!isUuid(id)) {
      return null;
    }
    const raw = await this.db.event.findFirst({
      where: { id, archivedAt: null },
      select: EVENT_SELECT,
    });
    return raw ? toRecord(raw) : null;
  }

  async findVisibleById(
    id: string,
    visibility: EventVisibility,
  ): Promise<EventRecord | null> {
    if (!isUuid(id)) return null;
    const raw = await this.db.event.findFirst({
      where: { AND: [{ id, archivedAt: null }, visibleWhere(visibility)] },
      select: EVENT_SELECT,
    });
    return raw ? toRecord(raw) : null;
  }

  /**
   * Planned-vs-actual for one event (EOM-01): `actualApproved` and
   * `actualPending` are summed separately from `Expense.actualAmount` by
   * status, so a pending expense can never be mistaken for approved spend.
   */
  async budgetSummary(eventId: string): Promise<EventBudgetSummary | null> {
    if (!isUuid(eventId)) return null;
    const event = await this.db.event.findFirst({
      where: { id: eventId, archivedAt: null },
      select: { budgetAmount: true, budgetCurrency: true },
    });
    if (!event) return null;
    const sums = await this.db.expense.groupBy({
      by: ["status"],
      where: { eventId, status: { in: ["APPROVED", "SUBMITTED"] } },
      _sum: { actualAmount: true },
    });
    const approved = sums.find((row) => row.status === "APPROVED");
    const pending = sums.find((row) => row.status === "SUBMITTED");
    return {
      plannedAmount:
        event.budgetAmount === null ? null : event.budgetAmount.toFixed(2),
      currency:
        event.budgetCurrency === null ? null : event.budgetCurrency.trim(),
      actualApproved: approved?._sum.actualAmount?.toFixed(2) ?? "0.00",
      actualPending: pending?._sum.actualAmount?.toFixed(2) ?? "0.00",
    };
  }

  /**
   * Creates the connected workspace (`kind = EVENT`) and the event together in
   * one transaction - the pairing EVT-01 assigned to this slice. Returns the
   * created record, or `"manager_not_found"` when the optional manager id has no
   * user.
   */
  async create(
    input: CreateEventInput,
    audit?: EventAuditContext,
  ): Promise<EventRecord | "manager_not_found" | "team_not_found"> {
    try {
      return await this.db.$transaction(async (tx) => {
        // Teams are checked up front so an unknown id is a clean outcome,
        // not an ambiguous foreign-key failure mixed up with the manager.
        const teamIds = [...new Set(input.teamIds ?? [])];
        if (teamIds.length > 0) {
          const found = await tx.team.count({ where: { id: { in: teamIds } } });
          if (found !== teamIds.length) {
            throw new TeamNotFoundOutcome();
          }
        }

        const workspace = await tx.workspace.create({
          data: {
            kind: WorkspaceKind.EVENT,
            ...(input.managerId ? { managerId: input.managerId } : {}),
          },
          select: { id: true },
        });
        if (teamIds.length > 0) {
          await tx.workspaceTeam.createMany({
            data: teamIds.map((teamId) => ({
              workspaceId: workspace.id,
              teamId,
            })),
          });
        }
        const event = await tx.event.create({
          data: {
            workspaceId: workspace.id,
            name: input.name,
            eventType: input.eventType,
            createdById: input.createdById,
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(input.startAt !== undefined ? { startAt: input.startAt } : {}),
            ...(input.endAt !== undefined ? { endAt: input.endAt } : {}),
            ...(input.reminderAt !== undefined
              ? { reminderAt: input.reminderAt }
              : {}),
            ...(input.location !== undefined
              ? { location: input.location }
              : {}),
            ...(input.organizerName !== undefined
              ? { organizerName: input.organizerName }
              : {}),
            ...(input.departmentId ? { departmentId: input.departmentId } : {}),
            ...(input.status ? { status: input.status } : {}),
            ...(input.budget
              ? {
                  budgetAmount: input.budget.amount,
                  budgetCurrency: input.budget.currency,
                }
              : {}),
          },
          select: EVENT_SELECT,
        });
        await this.appendAudit(tx, audit, {
          action: "event.created",
          resourceType: "event",
          resourceId: event.id,
          workspaceId: workspace.id,
        });
        return toRecord(event);
      });
    } catch (error) {
      if (error instanceof TeamNotFoundOutcome) {
        return "team_not_found";
      }
      if (isPrismaError(error, PRISMA_ERROR.foreignKeyViolation)) {
        return "manager_not_found";
      }
      throw error;
    }
  }

  async listMilestones(eventId: string): Promise<EventMilestoneRecord[]> {
    return this.db.eventMilestone.findMany({
      where: { eventId },
      select: MILESTONE_SELECT,
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: MILESTONE_LIMIT,
    });
  }

  async createMilestone(
    event: Pick<EventRecord, "id" | "workspaceId">,
    fields: EventMilestoneFields & { name: string; dueDate: Date },
    audit: EventAuditContext,
  ): Promise<EventMilestoneRecord> {
    return this.db.$transaction(async (tx) => {
      const milestone = await tx.eventMilestone.create({
        data: {
          ...fields,
          eventId: event.id,
          createdById: audit.actorUserId,
          updatedById: audit.actorUserId,
        },
        select: MILESTONE_SELECT,
      });
      await this.appendAudit(tx, audit, {
        action: "event.milestone.created",
        resourceType: "event_milestone",
        resourceId: milestone.id,
        workspaceId: event.workspaceId,
        metadata: { milestoneName: milestone.name },
      });
      return milestone;
    });
  }

  async updateMilestone(
    event: Pick<EventRecord, "id" | "workspaceId">,
    milestoneId: string,
    fields: EventMilestoneFields,
    audit: EventAuditContext,
  ): Promise<EventMilestoneRecord | "not_found"> {
    if (!isUuid(milestoneId)) return "not_found";
    return this.db.$transaction(async (tx) => {
      const { count } = await tx.eventMilestone.updateMany({
        where: { id: milestoneId, eventId: event.id },
        data: { ...fields, updatedById: audit.actorUserId },
      });
      if (count === 0) return "not_found";
      const milestone = await tx.eventMilestone.findUniqueOrThrow({
        where: { id: milestoneId },
        select: MILESTONE_SELECT,
      });
      await this.appendAudit(tx, audit, {
        action: "event.milestone.updated",
        resourceType: "event_milestone",
        resourceId: milestone.id,
        workspaceId: event.workspaceId,
        metadata: { milestoneName: milestone.name },
      });
      return milestone;
    });
  }

  async deleteMilestone(
    event: Pick<EventRecord, "id" | "workspaceId">,
    milestoneId: string,
    audit: EventAuditContext,
  ): Promise<"deleted" | "not_found"> {
    if (!isUuid(milestoneId)) return "not_found";
    return this.db.$transaction(async (tx) => {
      const milestone = await tx.eventMilestone.findFirst({
        where: { id: milestoneId, eventId: event.id },
        select: { id: true, name: true },
      });
      if (!milestone) return "not_found";
      await tx.eventMilestone.delete({ where: { id: milestone.id } });
      await this.appendAudit(tx, audit, {
        action: "event.milestone.deleted",
        resourceType: "event_milestone",
        resourceId: milestone.id,
        workspaceId: event.workspaceId,
        metadata: { milestoneName: milestone.name },
      });
      return "deleted";
    });
  }

  /** The figures behind the workspace Overview tiles. */
  async overview(
    event: Pick<EventRecord, "id" | "manager" | "teams" | "participants">,
  ): Promise<EventOverviewRecord> {
    const teamIds = event.teams.map((team) => team.id);
    const [tasks, milestones, members] = await Promise.all([
      this.db.task.groupBy({
        by: ["status"],
        where: { relatedEventId: event.id, status: { not: "CANCELLED" } },
        _count: { _all: true },
      }),
      this.db.eventMilestone.groupBy({
        by: ["status"],
        where: { eventId: event.id },
        _count: { _all: true },
      }),
      teamIds.length > 0
        ? this.db.teamMembership.findMany({
            where: { teamId: { in: teamIds } },
            select: { userId: true },
            distinct: ["userId"],
          })
        : Promise.resolve([]),
    ]);
    const people = new Set([
      ...members.map((member) => member.userId),
      ...event.participants.map((person) => person.id),
      ...(event.manager ? [event.manager.id] : []),
    ]);
    const taskCount = (status: string) =>
      tasks.find((row) => row.status === status)?._count._all ?? 0;
    return {
      tasks: {
        total: tasks.reduce((sum, row) => sum + row._count._all, 0),
        completed: taskCount("COMPLETED"),
        awaitingReview: taskCount("UNDER_REVIEW"),
      },
      teams: { count: teamIds.length, people: people.size },
      milestones: {
        total: milestones.reduce((sum, row) => sum + row._count._all, 0),
        completed:
          milestones.find((row) => row.status === "COMPLETED")?._count._all ??
          0,
      },
    };
  }

  /**
   * The event's linked tasks that this caller may read, under the same rule the
   * tasks module applies: organization sees all, department sees tasks in its
   * department, and self sees tasks it is assigned to or created.
   */
  async visibleLinkedTaskIds(
    eventId: string,
    visibility: {
      organization: boolean;
      departmentId: string | null;
      selfUserId: string | null;
    },
  ): Promise<string[]> {
    const alternatives: Prisma.TaskWhereInput[] = [];
    if (visibility.departmentId) {
      alternatives.push({ departmentId: visibility.departmentId });
    }
    if (visibility.selfUserId) {
      alternatives.push({
        assignments: { some: { userId: visibility.selfUserId } },
      });
      alternatives.push({ createdById: visibility.selfUserId });
    }
    if (!visibility.organization && alternatives.length === 0) return [];
    const tasks = await this.db.task.findMany({
      where: {
        relatedEventId: eventId,
        ...(visibility.organization ? {} : { OR: alternatives }),
      },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
      take: RELATED_TASK_LIMIT,
    });
    return tasks.map((task) => task.id);
  }

  /** Names for the activity feed. Removed users are simply absent. */
  async peopleByIds(
    ids: readonly string[],
  ): Promise<Map<string, EventPersonRecord>> {
    if (ids.length === 0) return new Map();
    const people = await this.db.user.findMany({
      where: { id: { in: [...ids] } },
      select: PERSON_SELECT,
    });
    return new Map(people.map((person) => [person.id, person]));
  }

  /** Counts linked tasks per event, excluding cancelled ones. Events with no
   * linked tasks are absent from the map. */
  async taskProgressFor(
    eventIds: readonly string[],
  ): Promise<Map<string, { completed: number; total: number }>> {
    const progress = new Map<string, { completed: number; total: number }>();
    const ids = eventIds.filter(isUuid);
    if (ids.length === 0) return progress;
    const rows = await this.db.task.groupBy({
      by: ["relatedEventId", "status"],
      where: {
        relatedEventId: { in: ids },
        status: { not: "CANCELLED" },
      },
      _count: { _all: true },
    });
    for (const row of rows) {
      if (!row.relatedEventId) continue;
      const entry = progress.get(row.relatedEventId) ?? {
        completed: 0,
        total: 0,
      };
      entry.total += row._count._all;
      if (row.status === "COMPLETED") entry.completed += row._count._all;
      progress.set(row.relatedEventId, entry);
    }
    return progress;
  }

  /** Headline counts over the caller's visible, non-archived events. */
  async summary(
    visibility: EventVisibility,
    now: Date,
  ): Promise<{
    total: number;
    upcoming: number;
    inProgress: number;
    completed: number;
  }> {
    const base: Prisma.EventWhereInput = {
      ...visibleWhere(visibility),
      archivedAt: null,
    };
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const [total, upcoming, inProgress, completed] = await Promise.all([
      this.db.event.count({ where: base }),
      this.db.event.count({
        where: {
          AND: [
            base,
            { startAt: { gt: now, lte: in30Days } },
            { status: { notIn: ["CANCELLED", "COMPLETED"] } },
          ],
        },
      }),
      this.db.event.count({
        where: { AND: [base, { status: "IN_PROGRESS" }] },
      }),
      this.db.event.count({
        where: {
          AND: [
            base,
            { status: "COMPLETED" },
            { startAt: { gte: startOfYear } },
          ],
        },
      }),
    ]);
    return { total, upcoming, inProgress, completed };
  }

  async update(
    id: string,
    fields: UpdateEventFields,
    audit?: EventAuditContext,
  ): Promise<EventRecord | "not_found"> {
    if (!isUuid(id)) {
      return "not_found";
    }
    try {
      return await this.db.$transaction(async (tx) => {
        const updated = await tx.event.update({
          where: { id, archivedAt: null },
          data: updateData(fields),
          select: EVENT_SELECT,
        });
        await this.appendAudit(tx, audit, {
          action: "event.updated",
          resourceType: "event",
          resourceId: id,
          workspaceId: updated.workspaceId,
        });
        return toRecord(updated);
      });
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.recordNotFound)) {
        return "not_found";
      }
      throw error;
    }
  }

  /**
   * A compare-and-swap: the write only applies when the row's status still
   * matches `expectedStatus` (the status the caller validated the move
   * against). Two concurrent transitions read the same stale status and
   * would otherwise both pass validation and both write, so an unconditional
   * update lets the later write silently win - including reopening a
   * terminal (Completed/Cancelled) record. `"status_changed"` tells the
   * caller its check is stale so it can re-validate against the status the
   * row now actually has.
   */
  async updateStatus(
    id: string,
    expectedStatus: EventStatus,
    status: EventStatus,
    audit?: EventAuditContext,
  ): Promise<EventRecord | "not_found" | "status_changed"> {
    if (!isUuid(id)) {
      return "not_found";
    }
    const count = await this.db.$transaction(async (tx) => {
      const moved = await tx.event.updateMany({
        where: { id, status: expectedStatus, archivedAt: null },
        data: { status },
      });
      if (moved.count > 0) {
        const { workspaceId } = await tx.event.findUniqueOrThrow({
          where: { id },
          select: { workspaceId: true },
        });
        await this.appendAudit(tx, audit, {
          action: "event.status_changed",
          resourceType: "event",
          resourceId: id,
          workspaceId,
          metadata: { from: expectedStatus, to: status },
        });
      }
      return moved.count;
    });
    const record = await this.findById(id);
    if (!record) {
      return "not_found";
    }
    return count === 0 ? "status_changed" : record;
  }

  async setBudget(
    id: string,
    amount: string | null,
    currency: string | null,
    audit?: EventAuditContext,
  ): Promise<EventRecord | "not_found"> {
    if (!isUuid(id)) {
      return "not_found";
    }
    try {
      return await this.db.$transaction(async (tx) => {
        const updated = await tx.event.update({
          where: { id, archivedAt: null },
          data: { budgetAmount: amount, budgetCurrency: currency },
          select: EVENT_SELECT,
        });
        // The budget is sensitive: the record says it changed, never to what.
        await this.appendAudit(tx, audit, {
          action: "event.budget_changed",
          resourceType: "event",
          resourceId: id,
          workspaceId: updated.workspaceId,
        });
        return toRecord(updated);
      });
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.recordNotFound)) {
        return "not_found";
      }
      throw error;
    }
  }

  /**
   * Removes the event and then its connected workspace in one transaction. The
   * workspace FK is `ON DELETE RESTRICT`, so the event must go first. An event
   * with talent assignment history is archived instead: the row, its workspace
   * and its assignments stay as they are, and reads stop returning it.
   */
  async delete(
    id: string,
    archive: ArchiveHook,
  ): Promise<"deleted" | "archived" | "not_found" | "has_managed_files"> {
    if (!isUuid(id)) {
      return "not_found";
    }
    try {
      return await this.db.$transaction(async (tx) => {
        const event = await tx.event.findFirst({
          where: { id, archivedAt: null },
          select: {
            workspaceId: true,
            name: true,
            workspace: { select: { managerId: true } },
          },
        });
        if (!event) return "not_found";
        if ((await tx.eventTalent.count({ where: { eventId: id } })) > 0) {
          await tx.event.update({
            where: { id },
            data: { archivedAt: new Date() },
          });
          await archive(tx, {
            label: event.name,
            workspaceManagerId: event.workspace.managerId,
            works: [{ kind: "EVENT", workId: id, workName: event.name }],
          });
          return "archived";
        }
        // A detached/rejected file remains for retention cleanup, but no
        // longer needs to retain an event workspace that is being removed.
        await tx.managedFile.updateMany({
          where: {
            intentWorkspaceId: event.workspaceId,
            state: "UNAVAILABLE",
          },
          data: { intentWorkspaceId: null },
        });
        await tx.event.delete({ where: { id } });
        await tx.workspace.delete({ where: { id: event.workspaceId } });
        return "deleted";
      });
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.recordNotFound)) {
        return "not_found";
      }
      if (isPrismaError(error, PRISMA_ERROR.foreignKeyViolation)) {
        return "has_managed_files";
      }
      throw error;
    }
  }
}
