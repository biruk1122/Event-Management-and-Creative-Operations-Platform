import { Injectable } from "@nestjs/common";

import type { AuditWorkspaceContextResolver } from "../audit/audit-workspace-context.js";
import {
  TaskStatus,
  type PermissionScope,
  type Prisma,
} from "../generated/prisma/client.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import type { CreateTaskChecklistItemDto } from "./dto/create-task-checklist-item.dto.js";
import type { CreateTaskCommentDto } from "./dto/create-task-comment.dto.js";
import type { CreateTaskDto } from "./dto/create-task.dto.js";
import type { ListTaskFeedQueryDto } from "./dto/list-task-feed-query.dto.js";
import {
  TaskSort,
  type ListTasksQueryDto,
} from "./dto/list-tasks-query.dto.js";
import type { ReviewTaskDto } from "./dto/review-task.dto.js";
import type {
  ReorderTaskChecklistItemsDto,
  UpdateTaskChecklistItemDto,
} from "./dto/update-task-checklist-item.dto.js";
import type { UpdateTaskDto } from "./dto/update-task.dto.js";
import type {
  PaginatedTaskActivitiesResponse,
  PaginatedTaskCommentsResponse,
  PaginatedTaskReviewsResponse,
  PaginatedTasksResponse,
  TaskChecklistItemResponse,
  TaskCommentResponse,
  TaskResponse,
} from "./tasks.contracts.js";
import {
  taskAssigneeNotAssigned,
  taskAssigneeOutsideDepartment,
  taskChecklistItemNotFound,
  taskChecklistItemOwnershipDenied,
  taskChecklistReorderMismatch,
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
  type TaskChecklistItemRecord,
  type TaskCommentRecord,
  type TaskPersonRecord,
  type TaskRecord,
  type TaskReviewRecord,
  type TaskSubtaskSummary,
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

  /**
   * @param selfMeans "assignee" narrows SELF-scope visibility to "I am
   * this task's assignee" only - used by the three assignee-only
   * self-report actions (status transition, checklist toggle, submit) so
   * a creator who is not also the assignee cannot use them. The default,
   * "assignee_or_creator", keeps the broader read/comment/attachment
   * behavior (a task's own creator can always see and discuss it).
   */
  private async visibilityFor(
    actingUserId: string,
    permissionKey: string,
    selfMeans: "assignee" | "assignee_or_creator" = "assignee_or_creator",
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
      ...(self
        ? {
            selfUserId: actingUserId,
            ...(selfMeans === "assignee" ? { selfAssigneeOnly: true } : {}),
          }
        : {}),
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
    selfMeans: "assignee" | "assignee_or_creator" = "assignee_or_creator",
  ): Promise<{ task: TaskRecord; visibility: TaskVisibility }> {
    const visibility = await this.visibilityFor(
      actingUserId,
      permissionKey,
      selfMeans,
    );
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
      ...(query.parentTaskId ? { parentTaskId: query.parentTaskId } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.createdById ? { createdById: query.createdById } : {}),
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
      items: items.map((item) => toTaskResponse(item)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(actingUserId: string, taskId: string): Promise<TaskResponse> {
    const task = await this.authorize(actingUserId, taskId, "task.read");
    // Only computed for the single-task detail view, not list/create, so an
    // ordinary task list never pays for a subtask-aggregation query it does
    // not need.
    const subtaskSummary = await this.repository.getSubtaskSummary(taskId);
    return toTaskResponse(task, subtaskSummary);
  }

  async create(
    actingUserId: string,
    dto: CreateTaskDto,
    requestId: string,
  ): Promise<TaskResponse> {
    const organization = await this.hasGrant(
      actingUserId,
      "task.create",
      "ORGANIZATION",
    );
    // A subtask inherits its parent's workspace/department rather than
    // trusting the client to repeat (or fake) them - this is also what keeps
    // a subtask always visible to whoever can already see its parent.
    let parent: TaskRecord | null = null;
    if (dto.parentTaskId) {
      parent = await this.authorize(
        actingUserId,
        dto.parentTaskId,
        "task.read",
      );
      // Only the parent's own assignee may break it into subordinate tasks -
      // a department-scoped `task.create` grant alone would let any peer
      // manager hijack someone else's assignment, not just the person it was
      // actually delegated to. An organization-scoped caller (Super Admin)
      // is never subject to this - the same "org scope always wins" idiom
      // used throughout this service.
      if (
        !organization &&
        !parent.assignees.some((assignee) => assignee.id === actingUserId)
      ) {
        throw permissionDenied();
      }
    }
    const workspaceId = parent
      ? (parent.workspaceId ?? undefined)
      : dto.workspaceId;
    const departmentId = parent
      ? (parent.departmentId ?? undefined)
      : dto.departmentId;
    if (!workspaceId && !departmentId) throw taskOwnerRequired();
    if (!organization) {
      if (!(await this.hasGrant(actingUserId, "task.create", "DEPARTMENT")))
        throw permissionDenied();
      const ownDepartmentId =
        await this.repository.findUserDepartmentId(actingUserId);
      if (!ownDepartmentId || ownDepartmentId !== departmentId)
        throw permissionDenied();
    }
    if (workspaceId && !(await this.repository.workspaceExists(workspaceId)))
      throw taskWorkspaceNotFound();
    if (departmentId && !(await this.repository.departmentExists(departmentId)))
      throw taskDepartmentNotFound();
    // Fail fast, before the task exists, rather than creating an unassigned
    // task and only then discovering the chosen person is outside scope.
    if (dto.assigneeId && departmentId) {
      const eligible =
        await this.repository.listEligibleAssignees(departmentId);
      if (!eligible.some((user) => user.id === dto.assigneeId))
        throw taskAssigneeOutsideDepartment();
    }
    const startAt = dto.startAt ? new Date(dto.startAt) : undefined;
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : undefined;
    assertSchedule(startAt ?? null, dueAt ?? null);
    const task = await this.repository.create({
      title: dto.title.trim(),
      createdById: actingUserId,
      ...(workspaceId ? { workspaceId } : {}),
      ...(departmentId ? { departmentId } : {}),
      ...(parent ? { parentTaskId: parent.id } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
      ...(dto.priority ? { priority: dto.priority } : {}),
      ...(dto.type ? { type: dto.type } : {}),
      ...(startAt ? { startAt } : {}),
      ...(dueAt ? { dueAt } : {}),
    });
    if (dto.assigneeId) {
      // Reuses the existing assignment path so the `task.assigned`
      // notification outbox event fires exactly as it does for a
      // post-creation assignment - no separate notification code needed.
      await this.addAssignee(actingUserId, task.id, dto.assigneeId, requestId);
      return this.get(actingUserId, task.id);
    }
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
      ...(dto.type !== undefined ? { type: dto.type } : {}),
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
    if (result === "assignee_outside_department")
      throw taskAssigneeOutsideDepartment();
    if (result === "forbidden" || !result)
      this.mutationUnavailable(visibility, result);
    return toTaskResponse(result);
  }

  /** Active staff of one department, for the create-task assignee picker. */
  async listEligibleAssignees(
    actingUserId: string,
    departmentId: string,
  ): Promise<TaskPersonRecord[]> {
    const visibility = await this.visibilityFor(actingUserId, "task.create");
    if (!visibility.organization && visibility.departmentId !== departmentId)
      throw permissionDenied();
    if (!(await this.repository.departmentExists(departmentId)))
      throw taskDepartmentNotFound();
    return this.repository.listEligibleAssignees(departmentId);
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
      "assignee",
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
      "assignee",
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

  async listChecklistItems(
    actingUserId: string,
    taskId: string,
  ): Promise<TaskChecklistItemResponse[]> {
    await this.authorize(actingUserId, taskId, "task.read");
    const items = await this.repository.listChecklistItems(taskId);
    return items.map(toChecklistItemResponse);
  }

  async addChecklistItem(
    actingUserId: string,
    taskId: string,
    dto: CreateTaskChecklistItemDto,
  ): Promise<TaskChecklistItemResponse> {
    const { visibility } = await this.mutationContext(
      actingUserId,
      taskId,
      "task.update",
    );
    const result = await this.repository.createChecklistItem({
      taskId,
      description: dto.description.trim(),
      actorId: actingUserId,
      visibility,
    });
    if (result === "forbidden" || !result)
      this.mutationUnavailable(visibility, result);
    return toChecklistItemResponse(result);
  }

  async updateChecklistItem(
    actingUserId: string,
    taskId: string,
    itemId: string,
    dto: UpdateTaskChecklistItemDto,
  ): Promise<TaskChecklistItemResponse> {
    const { visibility } = await this.mutationContext(
      actingUserId,
      taskId,
      "task.update",
    );
    const actorIsOrganizationScoped = await this.hasGrant(
      actingUserId,
      "task.update",
      "ORGANIZATION",
    );
    const result = await this.repository.updateChecklistItem({
      taskId,
      itemId,
      description: dto.description.trim(),
      actorId: actingUserId,
      visibility,
      actorIsOrganizationScoped,
    });
    if (result === "ownership_denied") throw taskChecklistItemOwnershipDenied();
    if (result === "not_found") throw taskChecklistItemNotFound();
    if (result === "forbidden" || !result)
      this.mutationUnavailable(visibility, result);
    return toChecklistItemResponse(result);
  }

  async removeChecklistItem(
    actingUserId: string,
    taskId: string,
    itemId: string,
  ): Promise<void> {
    const { visibility } = await this.mutationContext(
      actingUserId,
      taskId,
      "task.update",
    );
    const actorIsOrganizationScoped = await this.hasGrant(
      actingUserId,
      "task.update",
      "ORGANIZATION",
    );
    const result = await this.repository.removeChecklistItem({
      taskId,
      itemId,
      actorId: actingUserId,
      visibility,
      actorIsOrganizationScoped,
    });
    if (result === "ownership_denied") throw taskChecklistItemOwnershipDenied();
    if (result === "not_found") throw taskChecklistItemNotFound();
    if (result === "forbidden" || !result)
      this.mutationUnavailable(visibility, result);
  }

  async reorderChecklistItems(
    actingUserId: string,
    taskId: string,
    dto: ReorderTaskChecklistItemsDto,
  ): Promise<TaskChecklistItemResponse[]> {
    const { visibility } = await this.mutationContext(
      actingUserId,
      taskId,
      "task.update",
    );
    const result = await this.repository.reorderChecklistItems({
      taskId,
      orderedItemIds: dto.orderedItemIds,
      actorId: actingUserId,
      visibility,
    });
    if (result === "mismatch") throw taskChecklistReorderMismatch();
    if (result === "forbidden" || !result)
      this.mutationUnavailable(visibility, result);
    return result.map(toChecklistItemResponse);
  }

  /** Replaces the old numeric-set endpoint. `task.update_progress` now
   * means "may toggle this task's own checklist items" - same grants,
   * same scope resolution, no RBAC catalog change. Returns the full task
   * so the caller's progress bar updates in one round trip. */
  async toggleChecklistItem(
    actingUserId: string,
    taskId: string,
    itemId: string,
    completed: boolean,
  ): Promise<TaskResponse> {
    const { task, visibility } = await this.mutationContext(
      actingUserId,
      taskId,
      "task.update_progress",
      "assignee",
    );
    const result = await this.repository.setChecklistItemCompletion({
      taskId: task.id,
      itemId,
      completed,
      actorId: actingUserId,
      visibility,
    });
    if (result === "concurrent") throw taskConcurrentChange();
    if (result === "not_found") throw taskChecklistItemNotFound();
    if (result === "forbidden" || !result)
      this.mutationUnavailable(visibility, result);
    return this.get(actingUserId, taskId);
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
    // A Department Manager holds `task.review` at DEPARTMENT scope and may
    // also now be a task's own assignee (self-reporting a task Super Admin
    // gave them) - without this check they could approve their own
    // submission instead of it genuinely going to Super Admin, defeating
    // the "manager reports back" workflow. Checked unconditionally, before
    // the status check, the same way Attendance's review flows refuse
    // self-approval regardless of other state.
    if (task.assignees.some((assignee) => assignee.id === actingUserId)) {
      throw permissionDenied();
    }
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
  for (const key of ["title", "description", "priority", "type"] as const) {
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

function toTaskResponse(
  record: TaskRecord,
  subtaskSummary?: TaskSubtaskSummary | null,
): TaskResponse {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    departmentId: record.departmentId,
    parentTaskId: record.parentTaskId,
    title: record.title,
    description: record.description,
    priority: record.priority,
    type: record.type,
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
    checklistItems: record.checklistItems.map(toChecklistItemResponse),
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    subtaskSummary: subtaskSummary ?? null,
  };
}

function toChecklistItemResponse(
  record: TaskChecklistItemRecord,
): TaskChecklistItemResponse {
  return {
    id: record.id,
    description: record.description,
    completed: record.completed,
    position: record.position,
    completedBy: record.completedBy,
    completedAt: record.completedAt?.toISOString() ?? null,
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
