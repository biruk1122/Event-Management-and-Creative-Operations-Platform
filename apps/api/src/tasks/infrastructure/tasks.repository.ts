import { Injectable } from "@nestjs/common";

import {
  AuditActorKind,
  AuditOutcome,
  Prisma,
  TaskActivityType,
  TaskStatus,
  type TaskPriority,
  type TaskReviewOutcome,
} from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuditWriterService } from "../../audit/audit-writer.service.js";
import type { SupportedAuditAction } from "../../audit/audit.types.js";

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

export interface TaskRecord {
  id: string;
  workspaceId: string | null;
  departmentId: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  progress: number;
  startAt: Date | null;
  dueAt: Date | null;
  assignees: TaskAssigneeRecord[];
  createdBy: TaskPersonRecord | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskVisibility {
  organization: boolean;
  departmentId?: string;
  selfUserId?: string;
}

type MutationAccess = "visible" | "forbidden" | "not_found";

export interface ListTasksInput {
  visibility: TaskVisibility;
  status?: TaskStatus;
  priority?: TaskPriority;
  workspaceId?: string;
  departmentId?: string;
  assigneeId?: string;
  search?: string;
  scheduledFrom?: Date;
  scheduledTo?: Date;
  overdue?: boolean;
  sort: "updated" | "due" | "start";
  page: number;
  pageSize: number;
}

export interface CreateTaskInput {
  workspaceId?: string;
  departmentId?: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  startAt?: Date;
  dueAt?: Date;
  createdById: string;
}

export interface UpdateTaskFields {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
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

const TASK_SELECT = {
  id: true,
  workspaceId: true,
  departmentId: true,
  title: true,
  description: true,
  priority: true,
  status: true,
  progress: true,
  startAt: true,
  dueAt: true,
  assignments: {
    select: { assignedAt: true, user: { select: PERSON_SELECT } },
  },
  createdBy: { select: PERSON_SELECT },
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

function toTaskRecord(raw: RawTask): TaskRecord {
  return {
    id: raw.id,
    workspaceId: raw.workspaceId,
    departmentId: raw.departmentId,
    title: raw.title,
    description: raw.description,
    priority: raw.priority,
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
    createdBy: raw.createdBy,
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
  if (visibility.selfUserId) {
    alternatives.push(
      { assignments: { some: { userId: visibility.selfUserId } } },
      { createdById: visibility.selfUserId },
    );
  }
  return alternatives.length ? { OR: alternatives } : { id: { in: [] } };
}

function updateData(fields: UpdateTaskFields): Prisma.TaskUpdateInput {
  const data: Prisma.TaskUpdateInput = {};
  if (fields.title !== undefined) data.title = fields.title;
  if (fields.description !== undefined) data.description = fields.description;
  if (fields.priority !== undefined) data.priority = fields.priority;
  if (fields.startAt !== undefined) data.startAt = fields.startAt;
  if (fields.dueAt !== undefined) data.dueAt = fields.dueAt;
  return data;
}

function json(details: Record<string, unknown>): Prisma.InputJsonObject {
  return details as Prisma.InputJsonObject;
}

@Injectable()
export class TasksRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditWriterService,
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
      ],
      ...(input.status ? { status: input.status } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      ...(input.assigneeId
        ? { assignments: { some: { userId: input.assigneeId } } }
        : {}),
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

  async workspaceExists(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    return (await this.db.workspace.count({ where: { id } })) === 1;
  }

  async departmentExists(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    return (await this.db.department.count({ where: { id } })) === 1;
  }

  async create(input: CreateTaskInput): Promise<TaskRecord> {
    return this.db.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          title: input.title,
          createdById: input.createdById,
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
          ...(input.departmentId ? { departmentId: input.departmentId } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.priority ? { priority: input.priority } : {}),
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
          }),
        },
      });
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
      const task = await tx.task.findUnique({
        where: { id },
        select: TASK_SELECT,
      });
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
      return task ? toTaskRecord(task) : null;
    });
  }

  async setProgress(
    id: string,
    expected: number,
    progress: number,
    actorId: string,
    visibility: TaskVisibility,
  ): Promise<TaskRecord | "concurrent" | "forbidden" | null> {
    if (!isUuid(id)) return null;
    return this.db.$transaction(async (tx) => {
      const access = await this.lockMutationAccess(tx, id, visibility);
      if (access === "not_found") return null;
      if (access === "forbidden") return "forbidden";
      const changed = await tx.task.updateMany({
        where: { id, progress: expected },
        data: { progress },
      });
      if (changed.count !== 1) return "concurrent";
      if (expected !== progress) {
        await tx.taskActivity.create({
          data: {
            taskId: id,
            actorId,
            type: TaskActivityType.PROGRESS_UPDATED,
            details: json({ from: expected, to: progress }),
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

  async addAssignee(
    taskId: string,
    userId: string,
    actorId: string,
    visibility: TaskVisibility,
    requestId: string,
  ): Promise<TaskRecord | "forbidden" | "user_not_found" | null> {
    if (!isUuid(taskId) || !isUuid(userId)) return "user_not_found";
    return this.db.$transaction(async (tx) => {
      const access = await this.lockMutationAccess(tx, taskId, visibility);
      if (access === "not_found") return null;
      if (access === "forbidden") return "forbidden";
      if ((await tx.user.count({ where: { id: userId } })) !== 1)
        return "user_not_found";
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
            details: json({ reviewId: review.id, outcome: input.outcome }),
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
