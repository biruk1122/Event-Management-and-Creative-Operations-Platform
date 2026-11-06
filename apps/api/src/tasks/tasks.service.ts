import { Injectable } from "@nestjs/common";

import type { AuditWorkspaceContextResolver } from "../audit/audit-workspace-context.js";
import {
  TaskReviewOutcome,
  TaskStatus,
  type PermissionScope,
  type Prisma,
} from "../generated/prisma/client.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import {
  platformRole,
  type PlatformRole,
} from "../common/security/department-access.policy.js";
import {
  canAssignRole,
  canCreateSubtaskUnder,
  canReviewTask,
  isEligibleExplicitRecipient,
  isEligibleReviewer,
  resolveDesignatedReviewer,
  resolveInitialReportTo,
  type DesignatedReviewer,
  type RecipientCandidate,
  type ReviewerCandidate,
} from "./tasks-report-to.domain.js";
import type { CreateTaskChecklistItemDto } from "./dto/create-task-checklist-item.dto.js";
import type { CreateTaskCommentDto } from "./dto/create-task-comment.dto.js";
import type { CreateTaskDto } from "./dto/create-task.dto.js";
import type { ListTaskFeedQueryDto } from "./dto/list-task-feed-query.dto.js";
import {
  TaskSort,
  type ListTasksQueryDto,
} from "./dto/list-tasks-query.dto.js";
import type { ChangeTaskReviewerDto } from "./dto/change-task-reviewer.dto.js";
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
  taskChecklistLocked,
  taskChecklistReorderMismatch,
  taskConcurrentChange,
  taskDepartmentNotFound,
  taskInvalidTransition,
  taskNotFound,
  taskOwnerRequired,
  taskReportToInvalid,
  taskAssigneeNotEligible,
  taskIdentifier,
  taskRelatedNotFound,
  taskReviewNoteRequired,
  taskReviewerInvalid,
  taskReviewerReasonRequired,
  taskReviewerUnresolved,
  taskReviewStateConflict,
  taskSubtaskNotAllowed,
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

/** A reviewer's standing, independent of any one task's assignees. */
type ReviewerBase = Omit<ReviewerCandidate, "isAssignee">;

/** Checklist changes are closed while work is awaiting, or past, review. */
function assertChecklistOpen(task: TaskRecord): void {
  if (
    task.status === TaskStatus.UNDER_REVIEW ||
    task.status === TaskStatus.COMPLETED ||
    task.status === TaskStatus.CANCELLED
  ) {
    throw taskChecklistLocked();
  }
}

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

  private async actorRole(actingUserId: string): Promise<PlatformRole | null> {
    return (await this.permissions.getAccessContext(actingUserId)).role;
  }

  /**
   * Whether a person may review this task: active, not one of its assignees,
   * and holding task.review for the task's department (organization scope, or
   * department scope within the same department).
   */
  private async reviewerCandidate(
    task: TaskRecord,
    userId: string | null,
    cache?: Map<string, ReviewerBase | null>,
  ): Promise<ReviewerCandidate | null> {
    return this.reviewerCandidateFor(
      task.departmentId,
      task.assignees.map((assignee) => assignee.id),
      userId,
      cache,
    );
  }

  private async reviewerCandidateFor(
    departmentId: string | null,
    assigneeIds: readonly string[],
    userId: string | null,
    cache?: Map<string, ReviewerBase | null>,
  ): Promise<ReviewerCandidate | null> {
    if (!userId) return null;
    const key = `${userId}|${departmentId ?? ""}`;
    let base = cache?.get(key);
    if (base === undefined) {
      base = await this.reviewerBase(userId, departmentId);
      cache?.set(key, base);
    }
    return base ? { ...base, isAssignee: assigneeIds.includes(userId) } : null;
  }

  /** Everything about a reviewer that does not depend on the task's assignees. */
  private async reviewerBase(
    userId: string,
    departmentId: string | null,
  ): Promise<ReviewerBase | null> {
    const record = await this.repository.findRecipientCandidate(userId);
    if (!record) return null;
    const organization = await this.hasGrant(
      userId,
      "task.review",
      "ORGANIZATION",
    );
    const sameDepartment =
      departmentId !== null && record.departmentId === departmentId;
    const department =
      !organization &&
      sameDepartment &&
      (await this.hasGrant(userId, "task.review", "DEPARTMENT"));
    return {
      id: record.id,
      active: record.active,
      canReview: organization || department,
    };
  }

  /** The one reviewer this task answers to right now. */
  private async designatedReviewer(
    task: TaskRecord,
    cache?: Map<string, ReviewerBase | null>,
  ): Promise<DesignatedReviewer> {
    const reportToId = task.reportTo?.id ?? null;
    return resolveDesignatedReviewer({
      reportToId,
      reportTo: await this.reviewerCandidate(task, reportToId, cache),
      creator: reportToId
        ? null
        : await this.reviewerCandidate(task, task.createdBy?.id ?? null, cache),
    });
  }

  private async recipientCandidate(
    userId: string,
  ): Promise<RecipientCandidate | null> {
    const record = await this.repository.findRecipientCandidate(userId);
    if (!record) return null;
    return {
      id: record.id,
      active: record.active,
      role:
        record.roleIsSystem && record.roleName
          ? platformRole(record.roleName)
          : null,
      departmentId: record.departmentId,
    };
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

  /**
   * Adding, editing and removing checkpoints: anyone holding task.update in
   * scope (creator/assigner, managers, Admin, Super Admin) may write them; the
   * assignee may too, limited to the items they created (enforced by the
   * repository's owner check).
   */
  private async checklistWriteContext(
    actingUserId: string,
    taskId: string,
  ): Promise<{ task: TaskRecord; visibility: TaskVisibility }> {
    const organizer =
      (await this.hasGrant(actingUserId, "task.update", "ORGANIZATION")) ||
      (await this.hasGrant(actingUserId, "task.update", "DEPARTMENT"));
    return organizer
      ? this.mutationContext(actingUserId, taskId, "task.update")
      : this.mutationContext(
          actingUserId,
          taskId,
          "task.update_progress",
          "assignee",
        );
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
    if (query.reviewerUnresolved === true) {
      return this.listReviewerNeeded(query, visibility);
    }
    const { items, total } = await this.repository.list({
      visibility,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.parentTaskId ? { parentTaskId: query.parentTaskId } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.createdById ? { createdById: query.createdById } : {}),
      ...(query.reportToId ? { reportToId: query.reportToId } : {}),
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
      ...(query.scheduledFrom
        ? { scheduledFrom: new Date(query.scheduledFrom) }
        : {}),
      ...(query.scheduledTo
        ? { scheduledTo: new Date(query.scheduledTo) }
        : {}),
      ...(query.overdue !== undefined ? { overdue: query.overdue } : {}),
      ...(query.relatedEventId ? { relatedEventId: query.relatedEventId } : {}),
      ...(query.needsAttention !== undefined
        ? { needsAttention: query.needsAttention }
        : {}),
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

  /**
   * "Reviewer needed": visible tasks with no eligible designated reviewer. The
   * eligibility rule is the one the details view uses, so the list and the
   * details always agree. Matching tasks are found by scanning the other
   * filters in batches, sharing one reviewer-eligibility cache, then the
   * requested page is cut from the matches, so the total is exact.
   */
  private async listReviewerNeeded(
    query: ListTasksQueryDto,
    visibility: TaskVisibility,
  ): Promise<PaginatedTasksResponse> {
    const batchSize = 200;
    const cache = new Map<string, ReviewerBase | null>();
    const matches: TaskRecord[] = [];
    const params = {
      visibility,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.parentTaskId ? { parentTaskId: query.parentTaskId } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.createdById ? { createdById: query.createdById } : {}),
      ...(query.reportToId ? { reportToId: query.reportToId } : {}),
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
      ...(query.scheduledFrom
        ? { scheduledFrom: new Date(query.scheduledFrom) }
        : {}),
      ...(query.scheduledTo
        ? { scheduledTo: new Date(query.scheduledTo) }
        : {}),
      ...(query.overdue !== undefined ? { overdue: query.overdue } : {}),
      ...(query.relatedEventId ? { relatedEventId: query.relatedEventId } : {}),
      ...(query.needsAttention !== undefined
        ? { needsAttention: query.needsAttention }
        : {}),
      sort:
        query.sort === TaskSort.DUE_AT
          ? ("due" as const)
          : query.sort === TaskSort.START_AT
            ? ("start" as const)
            : ("updated" as const),
    };
    for (let page = 1; ; page++) {
      const { items } = await this.repository.list({
        ...params,
        page,
        pageSize: batchSize,
      });
      for (const task of items) {
        const designated = await this.designatedReviewer(task, cache);
        if (designated.status === "unresolved") matches.push(task);
      }
      if (items.length < batchSize) break;
    }
    const start = (query.page - 1) * query.pageSize;
    return {
      items: matches
        .slice(start, start + query.pageSize)
        .map((task) => toTaskResponse(task)),
      page: query.page,
      pageSize: query.pageSize,
      total: matches.length,
    };
  }

  async get(actingUserId: string, taskId: string): Promise<TaskResponse> {
    const task = await this.authorize(actingUserId, taskId, "task.read");
    // Only computed for the single-task detail view, not list/create, so an
    // ordinary task list never pays for a subtask-aggregation query it does
    // not need.
    const subtaskSummary = await this.repository.getSubtaskSummary(taskId);
    const designated = await this.designatedReviewer(task);
    const parent = task.parentTaskId
      ? await this.repository.findVisibleParentSummary(
          task.parentTaskId,
          await this.visibilityFor(actingUserId, "task.read"),
        )
      : null;
    return {
      ...toTaskResponse(task, subtaskSummary),
      reviewerUnresolved: designated.status === "unresolved",
      parentTask: parent
        ? {
            id: parent.id,
            identifier: taskIdentifier(parent.taskNumber),
            title: parent.title,
            status: parent.status,
          }
        : null,
    };
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
      // Subtasks belong to the parent's own chain: Super Admin under any
      // parent; Admin and Department Manager only under parents they created
      // or are assigned to. Department Members never create subtasks.
      if (
        !canCreateSubtaskUnder({
          actorId: actingUserId,
          actorRole: await this.actorRole(actingUserId),
          parentCreatedById: parent.createdBy?.id ?? null,
          parentAssigneeIds: parent.assignees.map((assignee) => assignee.id),
        })
      ) {
        throw taskSubtaskNotAllowed();
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
    // Only Super Admin may assign an Admin account as the assignee; checked
    // before the task exists.
    if (dto.assigneeId)
      await this.assertAssigneeAllowed(actingUserId, dto.assigneeId);
    const reportTo = resolveInitialReportTo({
      actorId: actingUserId,
      actorRole: await this.actorRole(actingUserId),
      explicitReportToId: dto.reportToId,
      candidate: dto.reportToId
        ? await this.recipientCandidate(dto.reportToId)
        : null,
      taskDepartmentId: departmentId ?? null,
    });
    if (!reportTo.ok) {
      if (reportTo.reason === "not_allowed") throw permissionDenied();
      throw taskReportToInvalid();
    }
    if (
      dto.reportToId &&
      !isEligibleReviewer(
        await this.reviewerCandidateFor(
          departmentId ?? null,
          [dto.assigneeId].filter((id): id is string => Boolean(id)),
          dto.reportToId,
        ),
      )
    ) {
      throw taskReviewerInvalid();
    }
    if (
      !(await this.repository.relatedLinksExist({
        eventId: dto.relatedEventId,
        campaignId: dto.relatedCampaignId,
      }))
    ) {
      throw taskRelatedNotFound();
    }
    const task = await this.repository.create({
      title: dto.title.trim(),
      createdById: actingUserId,
      reportToId: reportTo.reportToId,
      reportToPinned: reportTo.pinned,
      ...(workspaceId ? { workspaceId } : {}),
      ...(departmentId ? { departmentId } : {}),
      ...(parent ? { parentTaskId: parent.id } : {}),
      ...(dto.relatedEventId ? { relatedEventId: dto.relatedEventId } : {}),
      ...(dto.relatedCampaignId
        ? { relatedCampaignId: dto.relatedCampaignId }
        : {}),
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
    if (dto.relatedEventId !== undefined)
      fields.relatedEventId = dto.relatedEventId;
    if (dto.relatedCampaignId !== undefined)
      fields.relatedCampaignId = dto.relatedCampaignId;
    // Only a link being added or moved is checked: an existing link to archived
    // work stays as it is, so editing the task never silently breaks it.
    if (
      !(await this.repository.relatedLinksExist({
        eventId:
          dto.relatedEventId !== undefined &&
          dto.relatedEventId !== (task.relatedEvent?.id ?? null)
            ? dto.relatedEventId
            : undefined,
        campaignId:
          dto.relatedCampaignId !== undefined &&
          dto.relatedCampaignId !== (task.relatedCampaign?.id ?? null)
            ? dto.relatedCampaignId
            : undefined,
      }))
    ) {
      throw taskRelatedNotFound();
    }
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
    await this.assertAssigneeAllowed(actingUserId, userId);
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

  /** Admin accounts are assigned work only by Super Admin (Super Admin ->
   * Admin); an Admin or Department Manager cannot hand tasks to an Admin. */
  private async assertAssigneeAllowed(
    actingUserId: string,
    assigneeId: string,
  ): Promise<void> {
    const candidate = await this.recipientCandidate(assigneeId);
    // An unknown user is reported by the assignment itself as not found.
    if (!candidate) return;
    if (!canAssignRole(await this.actorRole(actingUserId), candidate.role)) {
      throw taskAssigneeNotEligible();
    }
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
    const excludeAdmins =
      (await this.actorRole(actingUserId)) !== "SUPER_ADMIN";
    return this.repository.listEligibleAssignees(departmentId, {
      excludeAdmins,
    });
  }

  /** Valid explicit recipients for a task in a department (Super Admin only). */
  async listEligibleRecipients(
    actingUserId: string,
    departmentId: string | null,
  ): Promise<TaskPersonRecord[]> {
    if ((await this.actorRole(actingUserId)) !== "SUPER_ADMIN")
      throw permissionDenied();
    const candidates =
      await this.repository.listRecipientCandidates(departmentId);
    return candidates
      .filter((candidate) =>
        isEligibleExplicitRecipient(
          {
            id: candidate.person.id,
            active: true,
            role:
              candidate.roleIsSystem && candidate.roleName
                ? platformRole(candidate.roleName)
                : null,
            departmentId: candidate.departmentId,
          },
          departmentId,
        ),
      )
      .map((candidate) => candidate.person);
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
    const { task, visibility } = await this.checklistWriteContext(
      actingUserId,
      taskId,
    );
    assertChecklistOpen(task);
    const result = await this.repository.createChecklistItem({
      taskId,
      description: dto.description.trim(),
      actorId: actingUserId,
      visibility,
    });
    if (result === "locked") throw taskChecklistLocked();
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
    const { task, visibility } = await this.checklistWriteContext(
      actingUserId,
      taskId,
    );
    assertChecklistOpen(task);
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
    if (result === "locked") throw taskChecklistLocked();
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
    const { task, visibility } = await this.checklistWriteContext(
      actingUserId,
      taskId,
    );
    assertChecklistOpen(task);
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
    if (result === "locked") throw taskChecklistLocked();
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
    const { task, visibility } = await this.mutationContext(
      actingUserId,
      taskId,
      "task.update",
    );
    assertChecklistOpen(task);
    const result = await this.repository.reorderChecklistItems({
      taskId,
      orderedItemIds: dto.orderedItemIds,
      actorId: actingUserId,
      visibility,
    });
    if (result === "locked") throw taskChecklistLocked();
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
    assertChecklistOpen(task);
    const result = await this.repository.setChecklistItemCompletion({
      taskId: task.id,
      itemId,
      completed,
      actorId: actingUserId,
      visibility,
    });
    if (result === "locked") throw taskChecklistLocked();
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
    // Only the designated reviewer decides, Super Admin included. A task
    // with no eligible reviewer is blocked for everyone until one is named.
    const designated = await this.designatedReviewer(task);
    if (designated.status === "unresolved") throw taskReviewerUnresolved();
    if (!canReviewTask({ actorId: actingUserId, designated }))
      throw permissionDenied();
    if (task.status !== TaskStatus.UNDER_REVIEW)
      throw taskReviewStateConflict();
    if (
      dto.outcome === TaskReviewOutcome.CHANGES_REQUESTED &&
      !dto.note?.trim()
    ) {
      throw taskReviewNoteRequired();
    }
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

  /**
   * Super Admin's deliberate, reason-required change of the designated
   * reviewer. The new reviewer must be eligible, and the change is recorded in
   * the activity log and the audit trail with the reason.
   */
  async changeReviewer(
    actingUserId: string,
    taskId: string,
    dto: ChangeTaskReviewerDto,
    requestId: string,
  ): Promise<TaskResponse> {
    if ((await this.actorRole(actingUserId)) !== "SUPER_ADMIN")
      throw permissionDenied();
    const { task, visibility } = await this.mutationContext(
      actingUserId,
      taskId,
      "task.review",
    );
    const reason = dto.reason.trim();
    if (!reason) throw taskReviewerReasonRequired();
    const candidate = await this.reviewerCandidate(task, dto.reviewerId);
    if (!isEligibleReviewer(candidate)) throw taskReviewerInvalid();
    const updated = await this.repository.setReportTo({
      taskId,
      reportToId: dto.reviewerId,
      pinned: true,
      actorId: actingUserId,
      visibility,
      requestId,
      reason,
    });
    if (updated === "forbidden" || !updated)
      this.mutationUnavailable(visibility, updated);
    return toTaskResponse(updated);
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

  async listReviewHistory(
    actingUserId: string,
    taskId: string,
    query: ListTaskFeedQueryDto,
  ): Promise<PaginatedTaskActivitiesResponse> {
    await this.authorize(actingUserId, taskId, "task.read");
    const { items, total } = await this.repository.listReviewHistory(
      taskId,
      query.page,
      query.pageSize,
    );
    return page(items.map(toActivityResponse), query, total);
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
    identifier: taskIdentifier(record.taskNumber),
    relatedEvent: record.relatedEvent,
    relatedCampaign: record.relatedCampaign,
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
    reportTo: record.reportTo,
    reportToPinned: record.reportToPinned,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    subtaskSummary: subtaskSummary ?? null,
    // Computed on the detail view only; null on lists where it is not needed.
    reviewerUnresolved: null,
    parentTask: null,
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
