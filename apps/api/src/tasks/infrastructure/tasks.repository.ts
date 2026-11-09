import { Injectable } from "@nestjs/common";

import {
  AuditActorKind,
  AuditOutcome,
  OutboxActorKind,
  Prisma,
  TaskActivityType,
  TaskPriority,
  TaskStatus,
  UserAccountStatus,
  type TaskReviewOutcome,
  type TaskType,
} from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuditWriterService } from "../../audit/audit-writer.service.js";
import type { SupportedAuditAction } from "../../audit/audit.types.js";
import { OutboxWriterService } from "../../outbox/outbox-writer.service.js";
import { TasksSmsService } from "../tasks-sms.service.js";
import { computeTaskProgress } from "../tasks-progress.domain.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export interface TaskPersonRecord {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface TaskAssigneeRecord extends TaskPersonRecord {
  assignedAt: Date;
}

export interface TaskChecklistItemRecord {
  id: string;
  taskId: string;
  description: string;
  completed: boolean;
  position: number;
  completedBy: TaskPersonRecord | null;
  completedAt: Date | null;
  createdBy: TaskPersonRecord | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskRecord {
  id: string;
  workspaceId: string | null;
  departmentId: string | null;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  type: TaskType;
  status: TaskStatus;
  progress: number | null;
  startAt: Date | null;
  dueAt: Date | null;
  assignees: TaskAssigneeRecord[];
  checklistItems: TaskChecklistItemRecord[];
  createdBy: TaskPersonRecord | null;
  /** Human-readable number behind TSK-###. */
  taskNumber: number;
  relatedEvent: { id: string; name: string } | null;
  relatedCampaign: { id: string; name: string } | null;
  /** Who receives this task's reports and decides its review; null on tasks
   * that predate per-task recipients (they keep the earlier review rule). */
  reportTo: TaskPersonRecord | null;
  reportToPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskVisibility {
  organization: boolean;
  departmentId?: string;
  /** Departments the caller oversees read-only (EVE-229). */
  overseenDepartmentIds?: string[];
  selfUserId?: string;
  /** When true, SELF-scope visibility requires the actor to be an
   * assignee specifically - not merely the task's creator. Used for the
   * assignee-only self-report actions (status transition, checklist
   * toggle, submit) so a Department Manager who only created and
   * assigned a task cannot also act as if they were its assignee. */
  selfAssigneeOnly?: boolean;
}

type MutationAccess = "visible" | "forbidden" | "not_found";

export interface ListTasksInput {
  visibility: TaskVisibility;
  status?: TaskStatus;
  priority?: TaskPriority;
  workspaceId?: string;
  departmentId?: string;
  assigneeId?: string;
  createdById?: string;
  reportToId?: string;
  parentTaskId?: string;
  search?: string;
  scheduledFrom?: Date;
  scheduledTo?: Date;
  overdue?: boolean;
  relatedEventId?: string;
  needsAttention?: boolean;
  sort: "updated" | "due" | "start";
  page: number;
  pageSize: number;
}

export interface CreateTaskInput {
  relatedEventId?: string;
  relatedCampaignId?: string;
  workspaceId?: string;
  departmentId?: string;
  parentTaskId?: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  type?: TaskType;
  startAt?: Date;
  dueAt?: Date;
  createdById: string;
  /** The resolved reporting recipient (see tasks-report-to.domain.ts). */
  reportToId?: string;
  reportToPinned?: boolean;
}

export interface TaskSubtaskSummary {
  total: number;
  completed: number;
  overdue: number;
  remaining: number;
}

export interface UpdateTaskFields {
  relatedEventId?: string | null;
  relatedCampaignId?: string | null;
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  type?: TaskType;
  startAt?: Date | null;
  dueAt?: Date | null;
}

export interface TaskCommentRecord {
  id: string;
  content: string;
  author: TaskPersonRecord | null;
  mentionedUsers: TaskPersonRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskReviewRecord {
  id: string;
  outcome: TaskReviewOutcome;
  note: string | null;
  reviewer: TaskPersonRecord | null;
  reviewedAt: Date;
}

export interface TaskActivityRecord {
  id: string;
  type: TaskActivityType;
  actor: TaskPersonRecord | null;
  details: Record<string, unknown>;
  occurredAt: Date;
}

const PERSON_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

const CHECKLIST_SELECT = {
  id: true,
  taskId: true,
  description: true,
  completed: true,
  position: true,
  completedBy: { select: PERSON_SELECT },
  completedAt: true,
  createdBy: { select: PERSON_SELECT },
  createdAt: true,
  updatedAt: true,
} as const;

const TASK_SELECT = {
  id: true,
  workspaceId: true,
  departmentId: true,
  parentTaskId: true,
  title: true,
  description: true,
  priority: true,
  type: true,
  status: true,
  progress: true,
  startAt: true,
  dueAt: true,
  assignments: {
    select: { assignedAt: true, user: { select: PERSON_SELECT } },
  },
  checklistItems: {
    select: CHECKLIST_SELECT,
    orderBy: { position: "asc" },
  },
  taskNumber: true,
  relatedEventId: true,
  relatedCampaignId: true,
  relatedEvent: { select: { id: true, name: true } },
  relatedCampaign: { select: { id: true, name: true } },
  createdBy: { select: PERSON_SELECT },
  reportToId: true,
  reportTo: { select: PERSON_SELECT },
  reportToPinned: true,
  createdAt: true,
  updatedAt: true,
} as const;

const COMMENT_SELECT = {
  id: true,
  content: true,
  author: { select: PERSON_SELECT },
  mentions: { select: { user: { select: PERSON_SELECT } } },
  createdAt: true,
  updatedAt: true,
} as const;

const REVIEW_SELECT = {
  id: true,
  outcome: true,
  note: true,
  reviewer: { select: PERSON_SELECT },
  reviewedAt: true,
} as const;

const ACTIVITY_SELECT = {
  id: true,
  type: true,
  actor: { select: PERSON_SELECT },
  details: true,
  occurredAt: true,
} as const;

type RawTask = Prisma.TaskGetPayload<{ select: typeof TASK_SELECT }>;
type RawChecklistItem = Prisma.TaskChecklistItemGetPayload<{
  select: typeof CHECKLIST_SELECT;
}>;
type RawComment = Prisma.TaskCommentGetPayload<{
  select: typeof COMMENT_SELECT;
}>;
type RawReview = Prisma.TaskReviewGetPayload<{ select: typeof REVIEW_SELECT }>;
type RawActivity = Prisma.TaskActivityGetPayload<{
  select: typeof ACTIVITY_SELECT;
}>;

function byPerson(a: TaskPersonRecord, b: TaskPersonRecord): number {
  return (
    (a.lastName ?? "").localeCompare(b.lastName ?? "") ||
    (a.firstName ?? "").localeCompare(b.firstName ?? "") ||
    a.email.localeCompare(b.email)
  );
}

function toChecklistItemRecord(raw: RawChecklistItem): TaskChecklistItemRecord {
  return {
    id: raw.id,
    taskId: raw.taskId,
    description: raw.description,
    completed: raw.completed,
    position: raw.position,
    completedBy: raw.completedBy,
    completedAt: raw.completedAt,
    createdBy: raw.createdBy,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function toTaskRecord(raw: RawTask): TaskRecord {
  return {
    id: raw.id,
    workspaceId: raw.workspaceId,
    departmentId: raw.departmentId,
    parentTaskId: raw.parentTaskId,
    title: raw.title,
    description: raw.description,
    priority: raw.priority,
    type: raw.type,
    status: raw.status,
    progress: raw.progress,
    startAt: raw.startAt,
    dueAt: raw.dueAt,
    assignees: raw.assignments
      .map((assignment) => ({
        ...assignment.user,
        assignedAt: assignment.assignedAt,
      }))
      .sort(byPerson),
    checklistItems: raw.checklistItems.map(toChecklistItemRecord),
    createdBy: raw.createdBy,
    taskNumber: raw.taskNumber,
    relatedEvent: raw.relatedEvent,
    relatedCampaign: raw.relatedCampaign,
    reportTo: raw.reportTo,
    reportToPinned: raw.reportToPinned,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function toCommentRecord(raw: RawComment): TaskCommentRecord {
  return {
    id: raw.id,
    content: raw.content,
    author: raw.author,
    mentionedUsers: raw.mentions.map(({ user }) => user).sort(byPerson),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function toReviewRecord(raw: RawReview): TaskReviewRecord {
  return {
    id: raw.id,
    outcome: raw.outcome,
    note: raw.note,
    reviewer: raw.reviewer,
    reviewedAt: raw.reviewedAt,
  };
}

function toActivityRecord(raw: RawActivity): TaskActivityRecord {
  const details =
    raw.details &&
    typeof raw.details === "object" &&
    !Array.isArray(raw.details)
      ? (raw.details as Record<string, unknown>)
      : {};
  return {
    id: raw.id,
    type: raw.type,
    actor: raw.actor,
    details,
    occurredAt: raw.occurredAt,
  };
}

function visibleWhere(visibility: TaskVisibility): Prisma.TaskWhereInput {
  if (visibility.organization) return {};
  const alternatives: Prisma.TaskWhereInput[] = [];
  if (visibility.departmentId) {
    alternatives.push({ departmentId: visibility.departmentId });
  }
  if (visibility.overseenDepartmentIds?.length) {
    alternatives.push({
      departmentId: { in: visibility.overseenDepartmentIds },
    });
  }
  if (visibility.selfUserId) {
    alternatives.push({
      assignments: { some: { userId: visibility.selfUserId } },
    });
    if (!visibility.selfAssigneeOnly) {
      alternatives.push({ createdById: visibility.selfUserId });
    }
  }
  return alternatives.length ? { OR: alternatives } : { id: { in: [] } };
}

function updateData(
  fields: UpdateTaskFields,
): Prisma.TaskUncheckedUpdateManyInput {
  // Scalar foreign keys, not relation connects: bulk updates (updateMany)
  // accept only scalar fields.
  const data: Prisma.TaskUncheckedUpdateManyInput = {};
  if (fields.title !== undefined) data.title = fields.title;
  if (fields.description !== undefined) data.description = fields.description;
  if (fields.priority !== undefined) data.priority = fields.priority;
  if (fields.type !== undefined) data.type = fields.type;
  if (fields.startAt !== undefined) data.startAt = fields.startAt;
  if (fields.dueAt !== undefined) data.dueAt = fields.dueAt;
  if (fields.relatedEventId !== undefined)
    data.relatedEventId = fields.relatedEventId;
  if (fields.relatedCampaignId !== undefined)
    data.relatedCampaignId = fields.relatedCampaignId;
  return data;
}

function json(details: Record<string, unknown>): Prisma.InputJsonObject {
  return details as Prisma.InputJsonObject;
}

/** Checklist writes are refused in these states (see lockChecklistAccess). */
const CHECKLIST_LOCKED_STATUSES: readonly TaskStatus[] = [
  TaskStatus.UNDER_REVIEW,
  TaskStatus.COMPLETED,
  TaskStatus.CANCELLED,
];

@Injectable()
export class TasksRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditWriterService,
    private readonly outbox: OutboxWriterService,
    private readonly taskSms: TasksSmsService,
  ) {}

  async findUserDepartmentId(userId: string): Promise<string | null> {
    if (!isUuid(userId)) return null;
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    return user?.departmentId ?? null;
  }

  async findWorkspaceContextById(taskId: string): Promise<string | null> {
    if (!isUuid(taskId)) return null;
    const task = await this.db.task.findUnique({
      where: { id: taskId },
      select: { workspaceId: true },
    });
    return task?.workspaceId ?? null;
  }

  async list(
    input: ListTasksInput,
  ): Promise<{ items: TaskRecord[]; total: number }> {
    const scheduleConditions: Prisma.TaskWhereInput[] = [];
    if (input.scheduledFrom) {
      scheduleConditions.push({
        OR: [
          { dueAt: { gte: input.scheduledFrom } },
          { dueAt: null, startAt: { gte: input.scheduledFrom } },
        ],
      });
    }
    if (input.scheduledTo) {
      scheduleConditions.push({
        OR: [
          { startAt: { lte: input.scheduledTo } },
          { startAt: null, dueAt: { lte: input.scheduledTo } },
        ],
      });
    }
    const where: Prisma.TaskWhereInput = {
      AND: [
        visibleWhere(input.visibility),
        ...scheduleConditions,
        ...(input.overdue
          ? [
              {
                dueAt: { lt: new Date() },
                status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
              } satisfies Prisma.TaskWhereInput,
            ]
          : []),
        ...(input.needsAttention
          ? [
              {
                status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
                OR: [
                  { dueAt: { lt: new Date() } },
                  {
                    status: {
                      in: [TaskStatus.BLOCKED, TaskStatus.UNDER_REVIEW],
                    },
                  },
                  {
                    priority: { in: [TaskPriority.HIGH, TaskPriority.URGENT] },
                  },
                ],
              } satisfies Prisma.TaskWhereInput,
            ]
          : []),
      ],
      ...(input.relatedEventId ? { relatedEventId: input.relatedEventId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      ...(input.parentTaskId ? { parentTaskId: input.parentTaskId } : {}),
      ...(input.assigneeId
        ? { assignments: { some: { userId: input.assigneeId } } }
        : {}),
      ...(input.createdById ? { createdById: input.createdById } : {}),
      ...(input.reportToId ? { reportToId: input.reportToId } : {}),
      ...(input.search
        ? {
            OR: [
              { title: { contains: input.search, mode: "insensitive" } },
              { description: { contains: input.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.TaskOrderByWithRelationInput[] =
      input.sort === "due"
        ? [{ dueAt: { sort: "asc", nulls: "last" } }, { id: "asc" }]
        : input.sort === "start"
          ? [{ startAt: { sort: "asc", nulls: "last" } }, { id: "asc" }]
          : [{ updatedAt: "desc" }, { id: "desc" }];
    const [items, total] = await Promise.all([
      this.db.task.findMany({
        where,
        select: TASK_SELECT,
        orderBy,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.task.count({ where }),
    ]);
    return { items: items.map(toTaskRecord), total };
  }

  async findById(id: string): Promise<TaskRecord | null> {
    if (!isUuid(id)) return null;
    const task = await this.db.task.findUnique({
      where: { id },
      select: TASK_SELECT,
    });
    return task ? toTaskRecord(task) : null;
  }

  /** For a parent task's detail view: are its subordinate tasks on track?
   * Never auto-transitions the parent itself - purely informational. */
  async getSubtaskSummary(taskId: string): Promise<TaskSubtaskSummary | null> {
    if (!isUuid(taskId)) return null;
    const [total, completed, overdue] = await Promise.all([
      this.db.task.count({ where: { parentTaskId: taskId } }),
      this.db.task.count({
        where: { parentTaskId: taskId, status: TaskStatus.COMPLETED },
      }),
      this.db.task.count({
        where: {
          parentTaskId: taskId,
          dueAt: { lt: new Date() },
          status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
        },
      }),
    ]);
    if (total === 0) return null;
    return { total, completed, overdue, remaining: total - completed };
  }

  async findVisibleById(
    id: string,
    visibility: TaskVisibility,
  ): Promise<TaskRecord | null> {
    if (!isUuid(id)) return null;
    const task = await this.db.task.findFirst({
      where: { AND: [{ id }, visibleWhere(visibility)] },
      select: TASK_SELECT,
    });
    return task ? toTaskRecord(task) : null;
  }

  private async lockMutationAccess(
    tx: Prisma.TransactionClient,
    taskId: string,
    visibility: TaskVisibility,
  ): Promise<MutationAccess> {
    if (!isUuid(taskId)) return "not_found";
    const locked = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM tasks WHERE id = ${taskId}::uuid FOR UPDATE`,
    );
    if (locked.length !== 1) return "not_found";
    const visible = await tx.task.count({
      where: { AND: [{ id: taskId }, visibleWhere(visibility)] },
    });
    return visible === 1 ? "visible" : "forbidden";
  }

  /**
   * Locks the task row (as lockMutationAccess does) and then refuses checklist
   * writes while the task is under review, completed or cancelled. Status
   * changes and reviews take the same row lock, so the status read here cannot
   * change before the checklist write commits: a concurrent review or completion
   * waits for this transaction, and this transaction sees whatever it committed.
   */
  private async lockChecklistAccess(
    tx: Prisma.TransactionClient,
    taskId: string,
    visibility: TaskVisibility,
  ): Promise<MutationAccess | "locked"> {
    const access = await this.lockMutationAccess(tx, taskId, visibility);
    if (access !== "visible") return access;
    const task = await tx.task.findUnique({
      where: { id: taskId },
      select: { status: true },
    });
    return task && CHECKLIST_LOCKED_STATUSES.includes(task.status)
      ? "locked"
      : "visible";
  }

  /** Only a checklist item's own creator may edit or remove it - holding
   * `task.update` grants the right to add items and toggle/reorder the
   * list, not to rewrite or discard someone else's checkpoint. An item
   * with no recorded creator (legacy data, or its creator's account was
   * since deleted) falls back to organization-scoped actors only, never
   * to a department-scoped Manager by default. */
  private ownsChecklistItem(
    item: { createdById: string | null },
    actorId: string,
    actorIsOrganizationScoped: boolean,
  ): boolean {
    if (item.createdById === actorId) return true;
    if (item.createdById === null) return actorIsOrganizationScoped;
    return false;
  }

  async workspaceExists(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    return (await this.db.workspace.count({ where: { id } })) === 1;
  }

  async departmentExists(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    return (await this.db.department.count({ where: { id } })) === 1;
  }

  /** Active staff of one department, for the create-task assignee picker. */
  async listEligibleAssignees(
    departmentId: string,
    options: { excludeAdmins?: boolean } = {},
  ): Promise<TaskPersonRecord[]> {
    if (!isUuid(departmentId)) return [];
    return this.db.user.findMany({
      where: {
        departmentId,
        status: UserAccountStatus.ACTIVE,
        ...(options.excludeAdmins
          ? {
              NOT: {
                roleAssignment: { role: { name: "Admin", isSystem: true } },
              },
            }
          : {}),
      },
      select: PERSON_SELECT,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
  }

  /** A potential reporting recipient with the facts the service needs to
   * validate the choice (active, system role name, department). */
  async findRecipientCandidate(userId: string): Promise<{
    id: string;
    active: boolean;
    departmentId: string | null;
    roleName: string | null;
    roleIsSystem: boolean;
  } | null> {
    if (!isUuid(userId)) return null;
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        departmentId: true,
        roleAssignment: {
          select: { role: { select: { name: true, isSystem: true } } },
        },
      },
    });
    if (!user) return null;
    return {
      id: user.id,
      active: user.status === UserAccountStatus.ACTIVE,
      departmentId: user.departmentId,
      roleName: user.roleAssignment?.role.name ?? null,
      roleIsSystem: user.roleAssignment?.role.isSystem ?? false,
    };
  }

  /** Active users who could be named a task's recipient: every Super Admin and
   * Admin, plus the given department's staff (filtered to its manager by the
   * service). The service decides eligibility from the system role. */
  async listRecipientCandidates(departmentId: string | null): Promise<
    {
      person: TaskPersonRecord;
      departmentId: string | null;
      roleName: string | null;
      roleIsSystem: boolean;
    }[]
  > {
    const users = await this.db.user.findMany({
      where: {
        status: UserAccountStatus.ACTIVE,
        roleAssignment: { role: { isSystem: true } },
        OR: [
          {
            roleAssignment: {
              role: { name: { in: ["Super Admin", "Admin"] } },
            },
          },
          ...(departmentId && isUuid(departmentId)
            ? [
                {
                  departmentId,
                  roleAssignment: { role: { name: "Department Manager" } },
                },
              ]
            : []),
        ],
      },
      select: {
        ...PERSON_SELECT,
        departmentId: true,
        roleAssignment: {
          select: { role: { select: { name: true, isSystem: true } } },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    return users.map((user) => ({
      person: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      departmentId: user.departmentId,
      roleName: user.roleAssignment?.role.name ?? null,
      roleIsSystem: user.roleAssignment?.role.isSystem ?? false,
    }));
  }

  /** Explicitly sets (or re-sets) a task's reporting recipient, recording the
   * from/to history in the activity log and the audit trail and notifying the
   * newly named recipient. */
  async setReportTo(input: {
    taskId: string;
    reportToId: string;
    pinned: boolean;
    actorId: string;
    visibility: TaskVisibility;
    requestId: string;
    /** The stated reason for an explicit reviewer change. */
    reason?: string;
  }): Promise<TaskRecord | "forbidden" | null> {
    if (!isUuid(input.taskId)) return null;
    return this.db.$transaction(async (tx) => {
      const access = await this.lockMutationAccess(
        tx,
        input.taskId,
        input.visibility,
      );
      if (access === "not_found") return null;
      if (access === "forbidden") return "forbidden";
      const before = await tx.task.findUnique({
        where: { id: input.taskId },
        select: { reportToId: true, workspaceId: true },
      });
      if (!before) return null;
      if (before.reportToId === input.reportToId) {
        if (input.pinned) {
          await tx.task.update({
            where: { id: input.taskId },
            data: { reportToPinned: true },
          });
        }
      } else {
        await tx.task.update({
          where: { id: input.taskId },
          data: {
            reportToId: input.reportToId,
            reportToPinned: input.pinned,
          },
        });
        const reason = input.reason ?? (input.pinned ? "explicit" : "assigner");
        await tx.taskActivity.create({
          data: {
            taskId: input.taskId,
            actorId: input.actorId,
            type: TaskActivityType.REPORT_TO_CHANGED,
            details: json({
              from: before.reportToId,
              to: input.reportToId,
              reason,
            }),
          },
        });
        await this.audit.append(tx, {
          action: "task.report_to_changed",
          actorKind: AuditActorKind.USER,
          actorUserId: input.actorId,
          metadata: { from: before.reportToId, to: input.reportToId, reason },
          outcome: AuditOutcome.SUCCEEDED,
          requestId: input.requestId,
          resourceId: input.taskId,
          resourceType: "task",
          ...(before.workspaceId
            ? { workspaceContext: before.workspaceId }
            : {}),
        });
        // Everyone the change touches is told: the new reviewer (who now
        // answers for approval), the previous reviewer, the creator and the
        // assignees. Each is an outbox event so delivery is durable.
        const participants = await tx.task.findUnique({
          where: { id: input.taskId },
          select: {
            createdById: true,
            assignments: { select: { userId: true } },
          },
        });
        const recipients = new Map<string, boolean>([[input.reportToId, true]]);
        for (const userId of [
          before.reportToId,
          participants?.createdById,
          ...(participants?.assignments.map(
            (assignment) => assignment.userId,
          ) ?? []),
        ]) {
          if (userId && !recipients.has(userId)) recipients.set(userId, false);
        }
        for (const [recipientUserId, isNewReviewer] of recipients) {
          if (recipientUserId === input.actorId) continue;
          await this.outbox.append(tx, {
            name: "task.reviewer_changed",
            version: 1,
            actorKind: OutboxActorKind.USER,
            actorUserId: input.actorId,
            correlationId: input.requestId,
            resourceType: "task",
            resourceId: input.taskId,
            ...(before.workspaceId
              ? { workspaceContext: before.workspaceId }
              : {}),
            payload: { recipientUserId, isNewReviewer },
            consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
          });
        }
      }
      const task = await tx.task.findUnique({
        where: { id: input.taskId },
        select: TASK_SELECT,
      });
      return task ? toTaskRecord(task) : null;
    });
  }

  /**
   * A parent task's summary for a subtask's details view, only when the
   * viewer can see that parent. A parent hidden from the viewer yields null,
   * so the subtask never reveals a task its viewer may not read.
   */
  async findVisibleParentSummary(
    parentTaskId: string,
    visibility: TaskVisibility,
  ): Promise<{
    id: string;
    taskNumber: number;
    title: string;
    status: TaskStatus;
  } | null> {
    if (!isUuid(parentTaskId)) return null;
    return this.db.task.findFirst({
      where: { AND: [{ id: parentTaskId }, visibleWhere(visibility)] },
      select: { id: true, taskNumber: true, title: true, status: true },
    });
  }

  /**
   * Whether the optional related event and campaign (when given) exist and are
   * not archived. Archived work cannot gain new links; existing links are kept.
   */
  async relatedLinksExist(input: {
    eventId?: string | null | undefined;
    campaignId?: string | null | undefined;
  }): Promise<boolean> {
    if (input.eventId) {
      if (!isUuid(input.eventId)) return false;
      const event = await this.db.event.findFirst({
        where: { id: input.eventId, archivedAt: null },
        select: { id: true },
      });
      if (!event) return false;
    }
    if (input.campaignId) {
      if (!isUuid(input.campaignId)) return false;
      const campaign = await this.db.campaign.findFirst({
        where: { id: input.campaignId, archivedAt: null },
        select: { id: true },
      });
      if (!campaign) return false;
    }
    return true;
  }

  async create(input: CreateTaskInput): Promise<TaskRecord> {
    return this.db.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          title: input.title,
          createdById: input.createdById,
          ...(input.relatedEventId
            ? { relatedEventId: input.relatedEventId }
            : {}),
          ...(input.relatedCampaignId
            ? { relatedCampaignId: input.relatedCampaignId }
            : {}),
          ...(input.reportToId
            ? {
                reportToId: input.reportToId,
                reportToPinned: input.reportToPinned ?? false,
              }
            : {}),
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
          ...(input.departmentId ? { departmentId: input.departmentId } : {}),
          ...(input.parentTaskId ? { parentTaskId: input.parentTaskId } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.priority ? { priority: input.priority } : {}),
          ...(input.type ? { type: input.type } : {}),
          ...(input.startAt ? { startAt: input.startAt } : {}),
          ...(input.dueAt ? { dueAt: input.dueAt } : {}),
        },
        select: TASK_SELECT,
      });
      await tx.taskActivity.create({
        data: {
          taskId: task.id,
          actorId: input.createdById,
          type: TaskActivityType.CREATED,
          details: json({
            workspaceId: task.workspaceId,
            departmentId: task.departmentId,
            reportToId: input.reportToId ?? null,
            parentTaskId: input.parentTaskId ?? null,
          }),
        },
      });
      if (input.reportToId) {
        await tx.taskActivity.create({
          data: {
            taskId: task.id,
            actorId: input.createdById,
            type: TaskActivityType.REPORT_TO_CHANGED,
            details: json({
              from: null,
              to: input.reportToId,
              reason: input.reportToPinned ? "explicit" : "created",
            }),
          },
        });
      }
      if (input.parentTaskId) {
        await tx.taskActivity.create({
          data: {
            taskId: input.parentTaskId,
            actorId: input.createdById,
            type: TaskActivityType.SUBTASK_ADDED,
            details: json({ subtaskId: task.id, title: task.title }),
          },
        });
        // The parent just gained a new child, which can change its own
        // aggregated progress (decision #5) even though the parent itself
        // was not directly edited.
        await this.recomputeProgressCascade(
          tx,
          input.parentTaskId,
          input.createdById,
        );
      }
      return toTaskRecord(task);
    });
  }

  async update(
    id: string,
    fields: UpdateTaskFields,
    actorId: string,
    details: Record<string, unknown>,
    visibility: TaskVisibility,
  ): Promise<TaskRecord | "forbidden" | null> {
    if (!isUuid(id)) return null;
    return this.db.$transaction(async (tx) => {
      const access = await this.lockMutationAccess(tx, id, visibility);
      if (access === "not_found") return null;
      if (access === "forbidden") return "forbidden";
      const changed = await tx.task.updateMany({
        where: { id },
        data: updateData(fields),
      });
      if (changed.count !== 1) return null;
      if (Object.keys(details).length) {
        await tx.taskActivity.create({
          data: {
            taskId: id,
            actorId,
            type: TaskActivityType.UPDATED,
            details: json(details),
          },
        });
      }
      const task = await tx.task.findUnique({
        where: { id },
        select: TASK_SELECT,
      });
      return task ? toTaskRecord(task) : null;
    });
  }

  async setStatus(
    id: string,
    expected: TaskStatus,
    status: TaskStatus,
    actorId: string,
    visibility: TaskVisibility,
    auditContext?: { action: SupportedAuditAction; requestId: string },
  ): Promise<TaskRecord | "concurrent" | "forbidden" | null> {
    if (!isUuid(id)) return null;
    return this.db.$transaction(async (tx) => {
      const access = await this.lockMutationAccess(tx, id, visibility);
      if (access === "not_found") return null;
      if (access === "forbidden") return "forbidden";
      const changed = await tx.task.updateMany({
        where: { id, status: expected },
        data: { status },
      });
      if (changed.count !== 1) return "concurrent";
      await tx.taskActivity.create({
        data: {
          taskId: id,
          actorId,
          type: TaskActivityType.STATUS_CHANGED,
          details: json({ from: expected, to: status }),
        },
      });
      if (status === TaskStatus.UNDER_REVIEW) {
        await tx.taskActivity.create({
          data: {
            taskId: id,
            actorId,
            type: TaskActivityType.SUBMITTED_FOR_REVIEW,
            details: json({ from: expected }),
          },
        });
      }
      const task = await tx.task.findUnique({
        where: { id },
        select: TASK_SELECT,
      });
      if (task?.parentTaskId) {
        // The parent's own history shows what happened to its subtasks.
        await tx.taskActivity.create({
          data: {
            taskId: task.parentTaskId,
            actorId,
            type: TaskActivityType.SUBTASK_UPDATED,
            details: json({ subtaskId: id, from: expected, to: status }),
          },
        });
      }
      if (task && auditContext) {
        await this.audit.append(tx, {
          action: auditContext.action,
          actorKind: AuditActorKind.USER,
          actorUserId: actorId,
          metadata: { from: expected, to: status },
          outcome: AuditOutcome.SUCCEEDED,
          requestId: auditContext.requestId,
          resourceId: id,
          resourceType: "task",
          ...(task.workspaceId ? { workspaceContext: task.workspaceId } : {}),
        });
      }
      // Tell the task's reporting recipient when work is submitted for their
      // review or becomes blocked (an escalation). Tasks without a recipient
      // (created before per-task recipients) notify nobody extra.
      const recipientId = task?.reportTo?.id;
      if (
        task &&
        recipientId &&
        recipientId !== actorId &&
        (status === TaskStatus.UNDER_REVIEW || status === TaskStatus.BLOCKED)
      ) {
        await this.outbox.append(tx, {
          name:
            status === TaskStatus.UNDER_REVIEW
              ? "task.submitted"
              : "task.blocked",
          version: 1,
          actorKind: OutboxActorKind.USER,
          actorUserId: actorId,
          ...(auditContext ? { correlationId: auditContext.requestId } : {}),
          resourceType: "task",
          resourceId: id,
          ...(task.workspaceId ? { workspaceContext: task.workspaceId } : {}),
          payload: { recipientUserId: recipientId },
          consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
        });
      }
      return task ? toTaskRecord(task) : null;
    });
  }

  /** Recomputes and persists `progress` for exactly one task from its
   * current checklist/children state, inside the caller's open
   * transaction. Returns the new value so callers can decide whether to
   * also write a PROGRESS_UPDATED activity row (only when it changed). */
  private async recomputeAndPersistProgress(
    tx: Prisma.TransactionClient,
    taskId: string,
  ): Promise<{ from: number | null; to: number | null }> {
    const [checklistItems, children, current] = await Promise.all([
      tx.taskChecklistItem.findMany({
        where: { taskId },
        select: { completed: true },
      }),
      tx.task.findMany({
        where: { parentTaskId: taskId },
        select: { progress: true },
      }),
      tx.task.findUnique({
        where: { id: taskId },
        select: { progress: true },
      }),
    ]);
    const to = computeTaskProgress({
      checklistItems,
      directChildren: children,
    });
    const from = current?.progress ?? null;
    if (from !== to) {
      await tx.task.update({ where: { id: taskId }, data: { progress: to } });
    }
    return { from, to };
  }

  /** Recomputes `taskId` itself, then (one level only) its immediate
   * parent if one exists, writing a PROGRESS_UPDATED activity row for
   * whichever of the two actually changed. Never touches `status`. */
  private async recomputeProgressCascade(
    tx: Prisma.TransactionClient,
    taskId: string,
    actorId: string,
  ): Promise<void> {
    const { from, to } = await this.recomputeAndPersistProgress(tx, taskId);
    if (from !== to) {
      await tx.taskActivity.create({
        data: {
          taskId,
          actorId,
          type: TaskActivityType.PROGRESS_UPDATED,
          details: json({ from, to }),
        },
      });
    }
    const self = await tx.task.findUnique({
      where: { id: taskId },
      select: { parentTaskId: true },
    });
    if (self?.parentTaskId) {
      const parentChange = await this.recomputeAndPersistProgress(
        tx,
        self.parentTaskId,
      );
      if (parentChange.from !== parentChange.to) {
        await tx.taskActivity.create({
          data: {
            taskId: self.parentTaskId,
            actorId,
            type: TaskActivityType.PROGRESS_UPDATED,
            details: json({
              from: parentChange.from,
              to: parentChange.to,
            }),
          },
        });
      }
    }
  }

  async listChecklistItems(taskId: string): Promise<TaskChecklistItemRecord[]> {
    if (!isUuid(taskId)) return [];
    const items = await this.db.taskChecklistItem.findMany({
      where: { taskId },
      select: CHECKLIST_SELECT,
      orderBy: { position: "asc" },
    });
    return items.map(toChecklistItemRecord);
  }

  async createChecklistItem(input: {
    taskId: string;
    description: string;
    actorId: string;
    visibility: TaskVisibility;
  }): Promise<TaskChecklistItemRecord | "forbidden" | "locked" | null> {
    if (!isUuid(input.taskId)) return null;
    return this.db.$transaction(async (tx) => {
      const access = await this.lockChecklistAccess(
        tx,
        input.taskId,
        input.visibility,
      );
      if (access === "not_found") return null;
      if (access === "forbidden") return "forbidden";
      if (access === "locked") return "locked";
      const last = await tx.taskChecklistItem.findFirst({
        where: { taskId: input.taskId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const item = await tx.taskChecklistItem.create({
        data: {
          taskId: input.taskId,
          description: input.description,
          position: (last?.position ?? -1) + 1,
          createdById: input.actorId,
        },
        select: CHECKLIST_SELECT,
      });
      await tx.taskActivity.create({
        data: {
          taskId: input.taskId,
          actorId: input.actorId,
          type: TaskActivityType.CHECKLIST_ITEM_ADDED,
          details: json({ itemId: item.id, description: item.description }),
        },
      });
      await this.recomputeProgressCascade(tx, input.taskId, input.actorId);
      return toChecklistItemRecord(item);
    });
  }

  async updateChecklistItem(input: {
    taskId: string;
    itemId: string;
    description: string;
    actorId: string;
    visibility: TaskVisibility;
    /** Resolves the legacy/unattributed-item fallback: an item with no
     * recorded creator (created before ownership was tracked, or whose
     * creator account was deleted) is only editable/removable by an
     * organization-scoped actor - never automatically opened up to a
     * department-scoped Manager just because attribution is missing. */
    actorIsOrganizationScoped: boolean;
  }): Promise<
    | TaskChecklistItemRecord
    | "forbidden"
    | "locked"
    | "not_found"
    | "ownership_denied"
    | null
  > {
    if (!isUuid(input.taskId) || !isUuid(input.itemId)) return "not_found";
    return this.db.$transaction(async (tx) => {
      const access = await this.lockChecklistAccess(
        tx,
        input.taskId,
        input.visibility,
      );
      if (access === "not_found") return null;
      if (access === "forbidden") return "forbidden";
      if (access === "locked") return "locked";
      const existing = await tx.taskChecklistItem.findFirst({
        where: { id: input.itemId, taskId: input.taskId },
        select: { createdById: true },
      });
      if (!existing) return "not_found";
      if (
        !this.ownsChecklistItem(
          existing,
          input.actorId,
          input.actorIsOrganizationScoped,
        )
      ) {
        return "ownership_denied";
      }
      const changed = await tx.taskChecklistItem.updateMany({
        where: { id: input.itemId, taskId: input.taskId },
        data: { description: input.description },
      });
      if (changed.count !== 1) return "not_found";
      await tx.taskActivity.create({
        data: {
          taskId: input.taskId,
          actorId: input.actorId,
          type: TaskActivityType.CHECKLIST_ITEM_UPDATED,
          details: json({
            itemId: input.itemId,
            description: input.description,
          }),
        },
      });
      const item = await tx.taskChecklistItem.findUnique({
        where: { id: input.itemId },
        select: CHECKLIST_SELECT,
      });
      return item ? toChecklistItemRecord(item) : null;
    });
  }

  async removeChecklistItem(input: {
    taskId: string;
    itemId: string;
    actorId: string;
    visibility: TaskVisibility;
    actorIsOrganizationScoped: boolean;
  }): Promise<
    "removed" | "forbidden" | "locked" | "not_found" | "ownership_denied" | null
  > {
    if (!isUuid(input.taskId) || !isUuid(input.itemId)) return "not_found";
    return this.db.$transaction(async (tx) => {
      const access = await this.lockChecklistAccess(
        tx,
        input.taskId,
        input.visibility,
      );
      if (access === "not_found") return null;
      if (access === "forbidden") return "forbidden";
      if (access === "locked") return "locked";
      const existing = await tx.taskChecklistItem.findFirst({
        where: { id: input.itemId, taskId: input.taskId },
        select: { createdById: true },
      });
      if (!existing) return "not_found";
      if (
        !this.ownsChecklistItem(
          existing,
          input.actorId,
          input.actorIsOrganizationScoped,
        )
      ) {
        return "ownership_denied";
      }
      const removed = await tx.taskChecklistItem.deleteMany({
        where: { id: input.itemId, taskId: input.taskId },
      });
      if (removed.count !== 1) return "not_found";
      await tx.taskActivity.create({
        data: {
          taskId: input.taskId,
          actorId: input.actorId,
          type: TaskActivityType.CHECKLIST_ITEM_REMOVED,
          details: json({ itemId: input.itemId }),
        },
      });
      await this.recomputeProgressCascade(tx, input.taskId, input.actorId);
      return "removed";
    });
  }

  async reorderChecklistItems(input: {
    taskId: string;
    orderedItemIds: string[];
    actorId: string;
    visibility: TaskVisibility;
  }): Promise<
    TaskChecklistItemRecord[] | "forbidden" | "locked" | "mismatch" | null
  > {
    if (!isUuid(input.taskId)) return null;
    return this.db.$transaction(async (tx) => {
      const access = await this.lockChecklistAccess(
        tx,
        input.taskId,
        input.visibility,
      );
      if (access === "not_found") return null;
      if (access === "forbidden") return "forbidden";
      if (access === "locked") return "locked";
      const current = await tx.taskChecklistItem.findMany({
        where: { taskId: input.taskId },
        select: { id: true },
      });
      const currentIds = new Set(current.map((item) => item.id));
      const requestedIds = new Set(input.orderedItemIds);
      if (
        currentIds.size !== requestedIds.size ||
        [...currentIds].some((id) => !requestedIds.has(id))
      ) {
        return "mismatch";
      }
      await Promise.all(
        input.orderedItemIds.map((id, index) =>
          tx.taskChecklistItem.updateMany({
            where: { id, taskId: input.taskId },
            data: { position: index },
          }),
        ),
      );
      await tx.taskActivity.create({
        data: {
          taskId: input.taskId,
          actorId: input.actorId,
          type: TaskActivityType.CHECKLIST_ITEM_REORDERED,
          details: json({ orderedItemIds: input.orderedItemIds }),
        },
      });
      const items = await tx.taskChecklistItem.findMany({
        where: { taskId: input.taskId },
        select: CHECKLIST_SELECT,
        orderBy: { position: "asc" },
      });
      return items.map(toChecklistItemRecord);
    });
  }

  async setChecklistItemCompletion(input: {
    taskId: string;
    itemId: string;
    completed: boolean;
    actorId: string;
    visibility: TaskVisibility;
  }): Promise<
    | TaskChecklistItemRecord
    | "forbidden"
    | "locked"
    | "not_found"
    | "concurrent"
    | null
  > {
    if (!isUuid(input.taskId) || !isUuid(input.itemId)) return "not_found";
    return this.db.$transaction(async (tx) => {
      const access = await this.lockChecklistAccess(
        tx,
        input.taskId,
        input.visibility,
      );
      if (access === "not_found") return null;
      if (access === "forbidden") return "forbidden";
      if (access === "locked") return "locked";
      const existing = await tx.taskChecklistItem.findFirst({
        where: { id: input.itemId, taskId: input.taskId },
        select: { completed: true },
      });
      if (!existing) return "not_found";
      const changed = await tx.taskChecklistItem.updateMany({
        where: {
          id: input.itemId,
          taskId: input.taskId,
          completed: existing.completed,
        },
        data: {
          completed: input.completed,
          completedById: input.completed ? input.actorId : null,
          completedAt: input.completed ? new Date() : null,
        },
      });
      if (changed.count !== 1) return "concurrent";
      await tx.taskActivity.create({
        data: {
          taskId: input.taskId,
          actorId: input.actorId,
          type: input.completed
            ? TaskActivityType.CHECKLIST_ITEM_COMPLETED
            : TaskActivityType.CHECKLIST_ITEM_REOPENED,
          details: json({ itemId: input.itemId }),
        },
      });
      await this.recomputeProgressCascade(tx, input.taskId, input.actorId);
      const item = await tx.taskChecklistItem.findUnique({
        where: { id: input.itemId },
        select: CHECKLIST_SELECT,
      });
      return item ? toChecklistItemRecord(item) : null;
    });
  }

  async addAssignee(
    taskId: string,
    userId: string,
    actorId: string,
    visibility: TaskVisibility,
    requestId: string,
  ): Promise<
    | TaskRecord
    | "forbidden"
    | "user_not_found"
    | "assignee_outside_department"
    | null
  > {
    if (!isUuid(taskId) || !isUuid(userId)) return "user_not_found";
    return this.db.$transaction(async (tx) => {
      const access = await this.lockMutationAccess(tx, taskId, visibility);
      if (access === "not_found") return null;
      if (access === "forbidden") return "forbidden";
      const [taskOwner, user] = await Promise.all([
        tx.task.findUnique({
          where: { id: taskId },
          select: { departmentId: true },
        }),
        tx.user.findUnique({
          where: { id: userId },
          select: { departmentId: true },
        }),
      ]);
      if (!user) return "user_not_found";
      // A department-owned task can only be assigned to that department's
      // own staff - never trust the caller's scope alone, since `task.assign`
      // at DEPARTMENT scope only proves the actor's own department, not the
      // target user's.
      if (
        taskOwner?.departmentId &&
        user.departmentId !== taskOwner.departmentId
      ) {
        return "assignee_outside_department";
      }
      const inserted = await tx.taskAssignment.createMany({
        data: [{ taskId, userId, assignedById: actorId }],
        skipDuplicates: true,
      });
      if (inserted.count === 1) {
        await tx.taskActivity.create({
          data: {
            taskId,
            actorId,
            type: TaskActivityType.ASSIGNEE_ADDED,
            details: json({ userId }),
          },
        });
      }
      const task = await tx.task.findUnique({
        where: { id: taskId },
        select: TASK_SELECT,
      });
      if (task && inserted.count === 1) {
        await this.audit.append(tx, {
          action: "task.assignee_added",
          actorKind: AuditActorKind.USER,
          actorUserId: actorId,
          metadata: { assigneeUserId: userId },
          outcome: AuditOutcome.SUCCEEDED,
          requestId,
          resourceId: taskId,
          resourceType: "task",
          ...(task.workspaceId ? { workspaceContext: task.workspaceId } : {}),
        });
        await this.outbox.append(tx, {
          name: "task.assigned",
          version: 1,
          actorKind: OutboxActorKind.USER,
          actorUserId: actorId,
          correlationId: requestId,
          resourceType: "task",
          resourceId: taskId,
          ...(task.workspaceId ? { workspaceContext: task.workspaceId } : {}),
          payload: { assigneeUserId: userId },
          consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
        });
        // Same transaction as the in-app notification: the SMS is queued only if the assignment is made.
        const assignment = await tx.taskAssignment.findUnique({
          where: { taskId_userId: { taskId, userId } },
          select: { id: true, assignedById: true },
        });
        if (assignment) {
          await this.taskSms.enqueueAssignment(tx, {
            taskId,
            assignmentId: assignment.id,
            taskTitle: task.title,
            dueAt: task.dueAt,
            assigneeUserId: userId,
            assignedById: actorId,
            requestId,
          });
        }
      }
      return task ? toTaskRecord(task) : null;
    });
  }

  async removeAssignee(
    taskId: string,
    userId: string,
    actorId: string,
    visibility: TaskVisibility,
    requestId: string,
  ): Promise<TaskRecord | "forbidden" | "not_assigned" | null> {
    if (!isUuid(taskId) || !isUuid(userId)) return "not_assigned";
    return this.db.$transaction(async (tx) => {
      const access = await this.lockMutationAccess(tx, taskId, visibility);
      if (access === "not_found") return null;
      if (access === "forbidden") return "forbidden";
      const removed = await tx.taskAssignment.deleteMany({
        where: { taskId, userId },
      });
      if (removed.count !== 1) return "not_assigned";
      await tx.taskActivity.create({
        data: {
          taskId,
          actorId,
          type: TaskActivityType.ASSIGNEE_REMOVED,
          details: json({ userId }),
        },
      });
      const task = await tx.task.findUnique({
        where: { id: taskId },
        select: TASK_SELECT,
      });
      if (task) {
        await this.audit.append(tx, {
          action: "task.assignee_removed",
          actorKind: AuditActorKind.USER,
          actorUserId: actorId,
          metadata: { assigneeUserId: userId },
          outcome: AuditOutcome.SUCCEEDED,
          requestId,
          resourceId: taskId,
          resourceType: "task",
          ...(task.workspaceId ? { workspaceContext: task.workspaceId } : {}),
        });
      }
      return task ? toTaskRecord(task) : null;
    });
  }

  async createComment(input: {
    taskId: string;
    authorId: string;
    content: string;
    mentionedUserIds: string[];
    visibility: TaskVisibility;
  }): Promise<
    TaskCommentRecord | "forbidden" | "not_found" | "user_not_found"
  > {
    return this.db.$transaction(async (tx) => {
      const access = await this.lockMutationAccess(
        tx,
        input.taskId,
        input.visibility,
      );
      if (access !== "visible") return access;
      if (input.mentionedUserIds.length) {
        const count = await tx.user.count({
          where: { id: { in: input.mentionedUserIds } },
        });
        if (count !== input.mentionedUserIds.length) return "user_not_found";
      }
      const comment = await tx.taskComment.create({
        data: {
          taskId: input.taskId,
          authorId: input.authorId,
          content: input.content,
          mentions: {
            create: input.mentionedUserIds.map((userId) => ({ userId })),
          },
        },
        select: COMMENT_SELECT,
      });
      await tx.taskActivity.create({
        data: {
          taskId: input.taskId,
          actorId: input.authorId,
          type: TaskActivityType.COMMENT_ADDED,
          details: json({
            commentId: comment.id,
            mentionedUserIds: input.mentionedUserIds,
          }),
        },
      });
      return toCommentRecord(comment);
    });
  }

  async review(input: {
    taskId: string;
    reviewerId: string;
    expectedStatus: TaskStatus;
    outcome: TaskReviewOutcome;
    targetStatus: TaskStatus;
    note?: string;
    visibility: TaskVisibility;
    requestId: string;
  }): Promise<
    | { task: TaskRecord; review: TaskReviewRecord }
    | "concurrent"
    | "forbidden"
    | null
  > {
    if (!isUuid(input.taskId)) return null;
    return this.db.$transaction(async (tx) => {
      const access = await this.lockMutationAccess(
        tx,
        input.taskId,
        input.visibility,
      );
      if (access === "not_found") return null;
      if (access === "forbidden") return "forbidden";
      const changed = await tx.task.updateMany({
        where: { id: input.taskId, status: input.expectedStatus },
        data: { status: input.targetStatus },
      });
      if (changed.count !== 1) return "concurrent";
      const review = await tx.taskReview.create({
        data: {
          taskId: input.taskId,
          reviewerId: input.reviewerId,
          outcome: input.outcome,
          ...(input.note ? { note: input.note } : {}),
        },
        select: REVIEW_SELECT,
      });
      await tx.taskActivity.createMany({
        data: [
          {
            taskId: input.taskId,
            actorId: input.reviewerId,
            type: TaskActivityType.REVIEW_RECORDED,
            details: json({
              reviewId: review.id,
              outcome: input.outcome,
              note: input.note ?? null,
            }),
          },
          {
            taskId: input.taskId,
            actorId: input.reviewerId,
            type: TaskActivityType.STATUS_CHANGED,
            details: json({
              from: input.expectedStatus,
              to: input.targetStatus,
            }),
          },
        ],
      });
      const task = await tx.task.findUnique({
        where: { id: input.taskId },
        select: TASK_SELECT,
      });
      if (task) {
        await this.audit.append(tx, {
          action:
            input.outcome === "APPROVED"
              ? "task.review.approved"
              : "task.review.changes_requested",
          actorKind: AuditActorKind.USER,
          actorUserId: input.reviewerId,
          metadata: {
            from: input.expectedStatus,
            outcome: input.outcome,
            to: input.targetStatus,
          },
          outcome: AuditOutcome.SUCCEEDED,
          requestId: input.requestId,
          resourceId: input.taskId,
          resourceType: "task",
          ...(task.workspaceId ? { workspaceContext: task.workspaceId } : {}),
        });
        await this.outbox.append(tx, {
          name: "task.reviewed",
          version: 1,
          actorKind: OutboxActorKind.USER,
          actorUserId: input.reviewerId,
          correlationId: input.requestId,
          resourceType: "task",
          resourceId: input.taskId,
          ...(task.workspaceId ? { workspaceContext: task.workspaceId } : {}),
          payload: { outcome: input.outcome, reviewId: review.id },
          consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
        });
      }
      return task
        ? { task: toTaskRecord(task), review: toReviewRecord(review) }
        : null;
    });
  }

  async lockAttachmentAccess(
    tx: Prisma.TransactionClient,
    taskId: string,
    visibility: TaskVisibility,
  ): Promise<MutationAccess> {
    return this.lockMutationAccess(tx, taskId, visibility);
  }

  async createAttachment(
    tx: Prisma.TransactionClient,
    input: { fileId: string; taskId: string; attachedById: string },
  ): Promise<void> {
    const attachment = await tx.taskAttachment.create({
      data: {
        attachedById: input.attachedById,
        managedFileId: input.fileId,
        taskId: input.taskId,
      },
      select: { id: true },
    });
    await tx.taskActivity.create({
      data: {
        taskId: input.taskId,
        actorId: input.attachedById,
        type: TaskActivityType.ATTACHMENT_ADDED,
        details: json({
          attachmentId: attachment.id,
          managedFileId: input.fileId,
        }),
      },
    });
  }

  async hasAttachment(taskId: string, fileId: string): Promise<boolean> {
    if (!isUuid(taskId) || !isUuid(fileId)) return false;
    return (
      (await this.db.taskAttachment.count({
        where: { taskId, managedFileId: fileId },
      })) === 1
    );
  }

  async listAttachmentFileIds(
    taskId: string,
    page: number,
    pageSize: number,
  ): Promise<{ fileIds: string[]; total: number }> {
    if (!isUuid(taskId)) return { fileIds: [], total: 0 };
    const where: Prisma.TaskAttachmentWhereInput = { taskId };
    const [attachments, total] = await Promise.all([
      this.db.taskAttachment.findMany({
        where,
        select: { managedFileId: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.taskAttachment.count({ where }),
    ]);
    return {
      fileIds: attachments.map(({ managedFileId }) => managedFileId),
      total,
    };
  }

  async listComments(
    taskId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: TaskCommentRecord[]; total: number }> {
    if (!isUuid(taskId)) return { items: [], total: 0 };
    const where: Prisma.TaskCommentWhereInput = { taskId };
    const [items, total] = await Promise.all([
      this.db.taskComment.findMany({
        where,
        select: COMMENT_SELECT,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.taskComment.count({ where }),
    ]);
    return { items: items.map(toCommentRecord), total };
  }

  async listReviews(
    taskId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: TaskReviewRecord[]; total: number }> {
    if (!isUuid(taskId)) return { items: [], total: 0 };
    const where: Prisma.TaskReviewWhereInput = { taskId };
    const [items, total] = await Promise.all([
      this.db.taskReview.findMany({
        where,
        select: REVIEW_SELECT,
        orderBy: [{ reviewedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.taskReview.count({ where }),
    ]);
    return { items: items.map(toReviewRecord), total };
  }

  /**
   * The review story of a task: every submission, review decision (with its
   * note), and designated-reviewer change, oldest first. Append-only records,
   * so nothing here is ever rewritten or removed.
   */
  async listReviewHistory(
    taskId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: TaskActivityRecord[]; total: number }> {
    if (!isUuid(taskId)) return { items: [], total: 0 };
    const where: Prisma.TaskActivityWhereInput = {
      taskId,
      type: {
        in: [
          TaskActivityType.SUBMITTED_FOR_REVIEW,
          TaskActivityType.REVIEW_RECORDED,
          TaskActivityType.REPORT_TO_CHANGED,
        ],
      },
    };
    const [items, total] = await Promise.all([
      this.db.taskActivity.findMany({
        where,
        select: ACTIVITY_SELECT,
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.taskActivity.count({ where }),
    ]);
    return { items: items.map(toActivityRecord), total };
  }

  async listActivities(
    taskId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: TaskActivityRecord[]; total: number }> {
    if (!isUuid(taskId)) return { items: [], total: 0 };
    const where: Prisma.TaskActivityWhereInput = { taskId };
    const [items, total] = await Promise.all([
      this.db.taskActivity.findMany({
        where,
        select: ACTIVITY_SELECT,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.taskActivity.count({ where }),
    ]);
    return { items: items.map(toActivityRecord), total };
  }
}
