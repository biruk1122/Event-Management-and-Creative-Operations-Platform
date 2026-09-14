import { Injectable } from "@nestjs/common";

import type { AuditWorkspaceContextResolver } from "../audit/audit-workspace-context.js";
import {
  TaskStatus,
  type PermissionScope,
  type Prisma,
} from "../generated/prisma/client.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import type { CreateTaskCommentDto } from "./dto/create-task-comment.dto.js";
import type { CreateTaskDto } from "./dto/create-task.dto.js";
import type { ListTaskFeedQueryDto } from "./dto/list-task-feed-query.dto.js";
import {
  TaskSort,
  type ListTasksQueryDto,
} from "./dto/list-tasks-query.dto.js";
import type { ReviewTaskDto } from "./dto/review-task.dto.js";
import type { UpdateTaskDto } from "./dto/update-task.dto.js";
import type {
  PaginatedTaskActivitiesResponse,
  PaginatedTaskCommentsResponse,
  PaginatedTaskReviewsResponse,
  PaginatedTasksResponse,
  TaskCommentResponse,
  TaskResponse,
} from "./tasks.contracts.js";
import {
  taskAssigneeNotAssigned,
  taskConcurrentChange,
  taskDepartmentNotFound,
  taskInvalidTransition,
  taskNotFound,
  taskOwnerRequired,
  taskReviewStateConflict,
  taskScheduleInvalid,
  taskUserNotFound,
  taskWorkspaceNotFound,
} from "./tasks.errors.js";
import { canAssigneeTransition, reviewTarget } from "./tasks.lifecycle.js";
import {
  TasksRepository,
  type TaskActivityRecord,
  type TaskCommentRecord,
  type TaskRecord,
  type TaskReviewRecord,
  type TaskVisibility,
  type UpdateTaskFields,
} from "./infrastructure/tasks.repository.js";

@Injectable()
export class TasksService implements AuditWorkspaceContextResolver {
  constructor(
    private readonly repository: TasksRepository,
    private readonly permissions: PermissionsService,
  ) {}

  resolveTaskWorkspaceContext(taskId: string): Promise<string | null> {
    return this.repository.findWorkspaceContextById(taskId);
  }

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
  ): Promise<TaskVisibility> {
    const [organization, department, self] = await Promise.all([
      this.hasGrant(actingUserId, permissionKey, "ORGANIZATION"),
      this.hasGrant(actingUserId, permissionKey, "DEPARTMENT"),
      this.hasGrant(actingUserId, permissionKey, "SELF"),
    ]);
    if (!organization && !department && !self) throw permissionDenied();
    const departmentId = department
      ? await this.repository.findUserDepartmentId(actingUserId)
      : null;
    return {
      organization,
      ...(departmentId ? { departmentId } : {}),
      ...(self ? { selfUserId: actingUserId } : {}),
    };
  }

  private async isAuthorizedFor(
    actingUserId: string,
    permissionKey: string,
    task: TaskRecord,
  ): Promise<boolean> {
    if (await this.hasGrant(actingUserId, permissionKey, "ORGANIZATION"))
      return true;
    if (await this.hasGrant(actingUserId, permissionKey, "DEPARTMENT")) {
      const departmentId =
        await this.repository.findUserDepartmentId(actingUserId);
      if (departmentId && departmentId === task.departmentId) return true;
    }
    if (await this.hasGrant(actingUserId, permissionKey, "SELF")) {
      return (
        task.createdBy?.id === actingUserId ||
        task.assignees.some((assignee) => assignee.id === actingUserId)
      );
    }
    return false;
  }

  private async mutationContext(
    actingUserId: string,
    taskId: string,
    permissionKey: string,
  ): Promise<{ task: TaskRecord; visibility: TaskVisibility }> {
    const visibility = await this.visibilityFor(actingUserId, permissionKey);
    const task = await this.repository.findVisibleById(taskId, visibility);
    if (!task) {
      if (visibility.organization) throw taskNotFound();
      throw permissionDenied();
    }
    return { task, visibility };
  }

  private mutationUnavailable(
    visibility: TaskVisibility,
    result: "forbidden" | null,
  ): never {
    if (result === "forbidden" || !visibility.organization)
      throw permissionDenied();
    throw taskNotFound();
  }

  /** Internal authorization boundary reused by the explicit task-file surface. */
  async authorize(
    actingUserId: string,
    taskId: string,
    permissionKey: string,
  ): Promise<TaskRecord> {
    const task = await this.repository.findById(taskId);
    if (!task) {
      // Organization-scoped callers may receive a real not-found. Narrower
      // callers get the same denial for an absent id and an out-of-scope id,
      // so ids cannot be used to probe work outside their scope.
      if (await this.hasGrant(actingUserId, permissionKey, "ORGANIZATION")) {
        throw taskNotFound();
      }
      throw permissionDenied();
    }
    if (!(await this.isAuthorizedFor(actingUserId, permissionKey, task))) {
      throw permissionDenied();
    }
    return task;
  }

  async list(
    actingUserId: string,
    query: ListTasksQueryDto,
  ): Promise<PaginatedTasksResponse> {
    const visibility = await this.visibilityFor(actingUserId, "task.read");
    const { items, total } = await this.repository.list({
      visibility,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
      ...(query.scheduledFrom
        ? { scheduledFrom: new Date(query.scheduledFrom) }
        : {}),
      ...(query.scheduledTo
        ? { scheduledTo: new Date(query.scheduledTo) }
        : {}),
      ...(query.overdue !== undefined ? { overdue: query.overdue } : {}),
      sort:
        query.sort === TaskSort.DUE_AT
          ? "due"
          : query.sort === TaskSort.START_AT
            ? "start"
            : "updated",
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items: items.map(toTaskResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(actingUserId: string, taskId: string): Promise<TaskResponse> {
    return toTaskResponse(
      await this.authorize(actingUserId, taskId, "task.read"),
    );
  }

  async create(
    actingUserId: string,
    dto: CreateTaskDto,
  ): Promise<TaskResponse> {
    if (!dto.workspaceId && !dto.departmentId) throw taskOwnerRequired();
    const organization = await this.hasGrant(
      actingUserId,
      "task.create",
      "ORGANIZATION",
    );
    if (!organization) {
      if (!(await this.hasGrant(actingUserId, "task.create", "DEPARTMENT")))
        throw permissionDenied();
      const ownDepartmentId =
        await this.repository.findUserDepartmentId(actingUserId);
      if (!ownDepartmentId || ownDepartmentId !== dto.departmentId)
        throw permissionDenied();
    }
    if (
      dto.workspaceId &&
      !(await this.repository.workspaceExists(dto.workspaceId))
    )
      throw taskWorkspaceNotFound();
    if (
      dto.departmentId &&
      !(await this.repository.departmentExists(dto.departmentId))
    )
      throw taskDepartmentNotFound();
    const startAt = dto.startAt ? new Date(dto.startAt) : undefined;
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : undefined;
    assertSchedule(startAt ?? null, dueAt ?? null);
    const task = await this.repository.create({
      title: dto.title.trim(),
      createdById: actingUserId,
      ...(dto.workspaceId ? { workspaceId: dto.workspaceId } : {}),
      ...(dto.departmentId ? { departmentId: dto.departmentId } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
      ...(dto.priority ? { priority: dto.priority } : {}),
      ...(startAt ? { startAt } : {}),
      ...(dueAt ? { dueAt } : {}),
    });
    return toTaskResponse(task);
  }

  async update(
    actingUserId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<TaskResponse> {
    const { task, visibility } = await this.mutationContext(
      actingUserId,
      taskId,
      "task.update",
    );
    const nextStart = resolveInstant(dto.startAt, task.startAt);
    const nextDue = resolveInstant(dto.dueAt, task.dueAt);
    assertSchedule(nextStart, nextDue);
    const fields: UpdateTaskFields = {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.description !== undefined
        ? {
            description:
              dto.description === null ? null : dto.description.trim(),
          }
        : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.startAt !== undefined
        ? { startAt: dto.startAt === null ? null : new Date(dto.startAt) }
        : {}),
      ...(dto.dueAt !== undefined
        ? { dueAt: dto.dueAt === null ? null : new Date(dto.dueAt) }
        : {}),
    };
    const details = changedFields(task, fields);
    const updated = await this.repository.update(
      taskId,
      fields,
      actingUserId,
      details,
      visibility,
    );
    if (updated === "forbidden" || !updated)
      this.mutationUnavailable(visibility, updated);
    return toTaskResponse(updated);
  }

  async addAssignee(
    actingUserId: string,
    taskId: string,
    userId: string,
    requestId: string,
  ): Promise<TaskResponse> {
    const { visibility } = await this.mutationContext(
      actingUserId,
      taskId,
      "task.assign",
    );
    const result = await this.repository.addAssignee(
      taskId,
      userId,
      actingUserId,
      visibility,
      requestId,
    );
    if (result === "user_not_found") throw taskUserNotFound();
    if (result === "forbidden" || !result)
      this.mutationUnavailable(visibility, result);
    return toTaskResponse(result);
  }

  async removeAssignee(
    actingUserId: string,
    taskId: string,
    userId: string,
    requestId: string,
  ): Promise<TaskResponse> {
    const { visibility } = await this.mutationContext(
      actingUserId,
      taskId,
      "task.assign",
    );
    const result = await this.repository.removeAssignee(
      taskId,
      userId,
      actingUserId,
      visibility,
      requestId,
    );
    if (result === "not_assigned") throw taskAssigneeNotAssigned();
    if (result === "forbidden" || !result)
      this.mutationUnavailable(visibility, result);
    return toTaskResponse(result);
  }

  async transition(
    actingUserId: string,
    taskId: string,
    target: TaskStatus,
  ): Promise<TaskResponse> {
    const { task, visibility } = await this.mutationContext(
      actingUserId,
      taskId,
      "task.update_status",
    );
    if (!canAssigneeTransition(task.status, target))
      throw taskInvalidTransition(task.status, target);
    return this.persistStatus(task, target, actingUserId, visibility);
  }

  async submit(
    actingUserId: string,
    taskId: string,
    requestId: string,
  ): Promise<TaskResponse> {
    const { task, visibility } = await this.mutationContext(
      actingUserId,
      taskId,
      "task.submit",
    );
    if (task.status !== TaskStatus.IN_PROGRESS)
      throw taskInvalidTransition(task.status, TaskStatus.UNDER_REVIEW);
    return this.persistStatus(
      task,
      TaskStatus.UNDER_REVIEW,
      actingUserId,
      visibility,
      { action: "task.submitted_for_review", requestId },
    );
  }

  private async persistStatus(
    task: TaskRecord,
    target: TaskStatus,
    actorId: string,
    visibility: TaskVisibility,
    auditContext?: {
      action: "task.submitted_for_review";
      requestId: string;
    },
  ): Promise<TaskResponse> {
    const updated = await this.repository.setStatus(
      task.id,
      task.status,
      target,
      actorId,
      visibility,
      auditContext,
    );
    if (updated === "concurrent") throw taskConcurrentChange();
    if (updated === "forbidden" || !updated)
      this.mutationUnavailable(visibility, updated);
    return toTaskResponse(updated);
  }

  async updateProgress(
    actingUserId: string,
    taskId: string,
    progress: number,
  ): Promise<TaskResponse> {
    const { task, visibility } = await this.mutationContext(
      actingUserId,
      taskId,
      "task.update_progress",
    );
    const updated = await this.repository.setProgress(
      taskId,
      task.progress,
      progress,
      actingUserId,
      visibility,
    );
    if (updated === "concurrent") throw taskConcurrentChange();
    if (updated === "forbidden" || !updated)
      this.mutationUnavailable(visibility, updated);
    return toTaskResponse(updated);
  }

  async review(
    actingUserId: string,
    taskId: string,
    dto: ReviewTaskDto,
    requestId: string,
  ): Promise<TaskResponse> {
    const { task, visibility } = await this.mutationContext(
      actingUserId,
      taskId,
      "task.review",
    );
    if (task.status !== TaskStatus.UNDER_REVIEW)
      throw taskReviewStateConflict();
    const result = await this.repository.review({
      taskId,
      reviewerId: actingUserId,
      expectedStatus: TaskStatus.UNDER_REVIEW,
      outcome: dto.outcome,
      targetStatus: reviewTarget(dto.outcome),
      visibility,
      requestId,
      ...(dto.note ? { note: dto.note.trim() } : {}),
    });
    if (result === "concurrent") throw taskReviewStateConflict();
    if (result === "forbidden" || !result)
      this.mutationUnavailable(visibility, result);
    return toTaskResponse(result.task);
  }

  async createComment(
    actingUserId: string,
    taskId: string,
    dto: CreateTaskCommentDto,
  ): Promise<TaskCommentResponse> {
    const { visibility } = await this.mutationContext(
      actingUserId,
      taskId,
      "task.comment.create",
    );
    const result = await this.repository.createComment({
      taskId,
      authorId: actingUserId,
      content: dto.content.trim(),
      mentionedUserIds: dto.mentionedUserIds ?? [],
      visibility,
    });
    if (result === "user_not_found") throw taskUserNotFound();
    if (result === "forbidden" || result === "not_found")
      this.mutationUnavailable(
        visibility,
        result === "forbidden" ? result : null,
      );
    return toCommentResponse(result);
  }

  /** Rechecks task attachment scope while the shared unit of work is open. */
  async lockAttachmentFinalization(
    tx: Prisma.TransactionClient,
    input: {
      actingUserId: string;
      taskId: string;
    },
  ): Promise<void> {
    const visibility = await this.visibilityFor(
      input.actingUserId,
      "task.attachment.create",
    );
    const access = await this.repository.lockAttachmentAccess(
      tx,
      input.taskId,
      visibility,
    );
    if (access === "forbidden" || access === "not_found")
      this.mutationUnavailable(
        visibility,
        access === "forbidden" ? access : null,
      );
  }

  /** Persists only the task-owned association and user-facing activity. */
  async recordAttachment(
    tx: Prisma.TransactionClient,
    input: {
      actingUserId: string;
      taskId: string;
      fileId: string;
    },
  ): Promise<void> {
    await this.repository.createAttachment(tx, {
      attachedById: input.actingUserId,
      fileId: input.fileId,
      taskId: input.taskId,
    });
  }

  async listAttachmentFileIds(
    actingUserId: string,
    taskId: string,
    pageNumber: number,
    pageSize: number,
  ): Promise<{ fileIds: string[]; total: number }> {
    await this.authorize(actingUserId, taskId, "task.read");
    return this.repository.listAttachmentFileIds(taskId, pageNumber, pageSize);
  }

  async readAttachmentContext(
    actingUserId: string,
    taskId: string,
    fileId: string,
  ): Promise<{ workspaceId: string | null } | null> {
    const task = await this.authorize(actingUserId, taskId, "task.read");
    return (await this.repository.hasAttachment(taskId, fileId))
      ? { workspaceId: task.workspaceId }
      : null;
  }

  async listComments(
    actingUserId: string,
    taskId: string,
    query: ListTaskFeedQueryDto,
  ): Promise<PaginatedTaskCommentsResponse> {
    await this.authorize(actingUserId, taskId, "task.read");
    const { items, total } = await this.repository.listComments(
      taskId,
      query.page,
      query.pageSize,
    );
    return page(items.map(toCommentResponse), query, total);
  }

  async listReviews(
    actingUserId: string,
    taskId: string,
    query: ListTaskFeedQueryDto,
  ): Promise<PaginatedTaskReviewsResponse> {
    await this.authorize(actingUserId, taskId, "task.read");
    const { items, total } = await this.repository.listReviews(
      taskId,
      query.page,
      query.pageSize,
    );
    return page(items.map(toReviewResponse), query, total);
  }

  async listActivities(
    actingUserId: string,
    taskId: string,
    query: ListTaskFeedQueryDto,
  ): Promise<PaginatedTaskActivitiesResponse> {
    await this.authorize(actingUserId, taskId, "task.read");
    const { items, total } = await this.repository.listActivities(
      taskId,
      query.page,
      query.pageSize,
    );
    return page(items.map(toActivityResponse), query, total);
  }
}

function assertSchedule(startAt: Date | null, dueAt: Date | null): void {
  if (startAt && dueAt && dueAt.getTime() < startAt.getTime())
    throw taskScheduleInvalid();
}

function resolveInstant(
  patched: string | null | undefined,
  current: Date | null,
): Date | null {
  if (patched === undefined) return current;
  return patched === null ? null : new Date(patched);
}

function changedFields(
  current: TaskRecord,
  fields: UpdateTaskFields,
): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  for (const key of ["title", "description", "priority"] as const) {
    if (fields[key] !== undefined && fields[key] !== current[key])
      details[key] = { from: current[key], to: fields[key] };
  }
  for (const key of ["startAt", "dueAt"] as const) {
    if (fields[key] !== undefined) {
      const from = current[key]?.toISOString() ?? null;
      const to = fields[key]?.toISOString() ?? null;
      if (from !== to) details[key] = { from, to };
    }
  }
  return details;
}

function toTaskResponse(record: TaskRecord): TaskResponse {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    departmentId: record.departmentId,
    title: record.title,
    description: record.description,
    priority: record.priority,
    status: record.status,
    progress: record.progress,
    startAt: record.startAt?.toISOString() ?? null,
    dueAt: record.dueAt?.toISOString() ?? null,
    assignees: record.assignees.map((assignee) => ({
      id: assignee.id,
      email: assignee.email,
      firstName: assignee.firstName,
      lastName: assignee.lastName,
      assignedAt: assignee.assignedAt.toISOString(),
    })),
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toCommentResponse(record: TaskCommentRecord): TaskCommentResponse {
  return {
    id: record.id,
    content: record.content,
    author: record.author,
    mentionedUsers: record.mentionedUsers,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toReviewResponse(record: TaskReviewRecord) {
  return {
    id: record.id,
    outcome: record.outcome,
    note: record.note,
    reviewer: record.reviewer,
    reviewedAt: record.reviewedAt.toISOString(),
  };
}

function toActivityResponse(record: TaskActivityRecord) {
  return {
    id: record.id,
    type: record.type,
    actor: record.actor,
    details: record.details,
    occurredAt: record.occurredAt.toISOString(),
  };
}

function page<T>(
  items: T[],
  query: ListTaskFeedQueryDto,
  total: number,
): { items: T[]; page: number; pageSize: number; total: number } {
  return { items, page: query.page, pageSize: query.pageSize, total };
}
