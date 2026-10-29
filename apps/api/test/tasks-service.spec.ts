import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  TaskReviewOutcome,
  TaskStatus,
  type PermissionScope,
} from "../src/generated/prisma/client.js";
import { TaskSort } from "../src/tasks/dto/list-tasks-query.dto.js";
import type { TaskRecord } from "../src/tasks/infrastructure/tasks.repository.js";
import { TasksService } from "../src/tasks/tasks.service.js";

const ACTOR = "actor-1";

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "task-1",
    workspaceId: null,
    departmentId: "department-1",
    parentTaskId: null,
    title: "Permits",
    description: null,
    priority: "MEDIUM",
    type: "GENERAL",
    status: TaskStatus.TODO,
    progress: null,
    startAt: null,
    dueAt: null,
    assignees: [],
    checklistItems: [],
    createdBy: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(HttpException);
  await promise.catch((error: unknown) => {
    expect(
      ((error as HttpException).getResponse() as { code: string }).code,
    ).toBe(code);
  });
}

describe("TasksService", () => {
  let repository: Record<string, ReturnType<typeof vi.fn>>;
  let permissions: {
    hasGrant: ReturnType<
      typeof vi.fn<
        (
          userId: string,
          key: string,
          scope: PermissionScope,
        ) => Promise<boolean>
      >
    >;
  };
  let service: TasksService;

  beforeEach(() => {
    repository = {
      findUserDepartmentId: vi.fn().mockResolvedValue("department-1"),
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findById: vi.fn().mockResolvedValue(makeTask()),
      findVisibleById: vi.fn().mockResolvedValue(makeTask()),
      getSubtaskSummary: vi.fn().mockResolvedValue(null),
      workspaceExists: vi.fn().mockResolvedValue(true),
      departmentExists: vi.fn().mockResolvedValue(true),
      create: vi.fn().mockResolvedValue(makeTask()),
      update: vi.fn().mockResolvedValue(makeTask()),
      addAssignee: vi.fn().mockResolvedValue(makeTask()),
      removeAssignee: vi.fn().mockResolvedValue(makeTask()),
      setStatus: vi
        .fn()
        .mockImplementation((_id: string, _from: TaskStatus, to: TaskStatus) =>
          Promise.resolve(makeTask({ status: to })),
        ),
      listChecklistItems: vi.fn().mockResolvedValue([]),
      createChecklistItem: vi.fn().mockResolvedValue({
        id: "item-1",
        taskId: "task-1",
        description: "Confirm venue permits",
        completed: false,
        position: 0,
        completedBy: null,
        completedAt: null,
        createdBy: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
      updateChecklistItem: vi.fn().mockResolvedValue({
        id: "item-1",
        taskId: "task-1",
        description: "Updated",
        completed: false,
        position: 0,
        completedBy: null,
        completedAt: null,
        createdBy: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
      removeChecklistItem: vi.fn().mockResolvedValue("removed"),
      reorderChecklistItems: vi.fn().mockResolvedValue([]),
      setChecklistItemCompletion: vi.fn().mockResolvedValue({
        id: "item-1",
        taskId: "task-1",
        description: "Confirm venue permits",
        completed: true,
        position: 0,
        completedBy: null,
        completedAt: new Date("2026-01-01T00:00:00.000Z"),
        createdBy: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
      review: vi.fn().mockResolvedValue({
        task: makeTask({ status: TaskStatus.COMPLETED }),
        review: {},
      }),
      listEligibleAssignees: vi.fn().mockResolvedValue([]),
      createComment: vi.fn().mockResolvedValue({
        id: "comment-1",
        content: "done",
        author: null,
        mentionedUsers: [],
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
      listComments: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      listReviews: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      listActivities: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    permissions = { hasGrant: vi.fn().mockResolvedValue(false) };
    service = new TasksService(repository as never, permissions as never);
  });

  function grantOnly(...allowed: [string, PermissionScope][]): void {
    permissions.hasGrant.mockImplementation((_userId, key, scope) =>
      Promise.resolve(allowed.some(([k, s]) => k === key && s === scope)),
    );
  }

  it("builds a self-scoped list query without trusting a client owner", async () => {
    grantOnly(["task.read", "SELF"]);
    await service.list(ACTOR, {
      sort: TaskSort.UPDATED,
      page: 1,
      pageSize: 25,
    });
    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({
        visibility: { organization: false, selfUserId: ACTOR },
      }),
    );
  });

  it("allows a department grant only for a task in the actor's department", async () => {
    grantOnly(["task.update", "DEPARTMENT"]);
    await expect(
      service.update(ACTOR, "task-1", { title: "Updated" }),
    ).resolves.toBeDefined();

    repository.findVisibleById!.mockResolvedValue(null);
    await expectCode(
      service.update(ACTOR, "task-1", { title: "No" }),
      "PERMISSION_DENIED",
    );
  });

  it("does not reveal whether a task id exists to a narrow-scoped caller", async () => {
    grantOnly(["task.read", "SELF"]);
    repository.findById!.mockResolvedValue(null);
    await expectCode(service.get(ACTOR, "missing"), "PERMISSION_DENIED");

    grantOnly(["task.read", "ORGANIZATION"]);
    await expectCode(service.get(ACTOR, "missing"), "TASK_NOT_FOUND");
  });

  it("allows self operations only for an assignee or author", async () => {
    grantOnly(["task.update_status", "SELF"]);
    repository.findVisibleById!.mockResolvedValue(null);
    await expectCode(
      service.transition(ACTOR, "task-1", TaskStatus.IN_PROGRESS),
      "PERMISSION_DENIED",
    );

    repository.findVisibleById!.mockResolvedValue(
      makeTask({
        assignees: [
          {
            id: ACTOR,
            email: "actor@example.com",
            firstName: null,
            lastName: null,
            assignedAt: new Date(),
          },
        ],
      }),
    );
    await expect(
      service.transition(ACTOR, "task-1", TaskStatus.IN_PROGRESS),
    ).resolves.toMatchObject({ status: TaskStatus.IN_PROGRESS });
  });

  it("prevents assignees from bypassing submission and review", async () => {
    grantOnly(["task.update_status", "SELF"]);
    repository.findVisibleById!.mockResolvedValue(
      makeTask({
        status: TaskStatus.IN_PROGRESS,
        createdBy: {
          id: ACTOR,
          email: "actor@example.com",
          firstName: null,
          lastName: null,
        },
      }),
    );
    await expectCode(
      service.transition(ACTOR, "task-1", TaskStatus.UNDER_REVIEW),
      "TASK_INVALID_TRANSITION",
    );
    expect(repository.setStatus).not.toHaveBeenCalled();
  });

  it("submits only an in-progress assigned task", async () => {
    grantOnly(["task.submit", "SELF"]);
    repository.findVisibleById!.mockResolvedValue(
      makeTask({
        status: TaskStatus.IN_PROGRESS,
        createdBy: {
          id: ACTOR,
          email: "actor@example.com",
          firstName: null,
          lastName: null,
        },
      }),
    );
    await expect(
      service.submit(ACTOR, "task-1", "request-1"),
    ).resolves.toMatchObject({
      status: TaskStatus.UNDER_REVIEW,
    });
  });

  it("maps review outcomes to the approved lifecycle targets", async () => {
    grantOnly(["task.review", "ORGANIZATION"]);
    repository.findVisibleById!.mockResolvedValue(
      makeTask({ status: TaskStatus.UNDER_REVIEW }),
    );
    await service.review(
      ACTOR,
      "task-1",
      { outcome: TaskReviewOutcome.APPROVED },
      "request-1",
    );
    expect(repository.review).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedStatus: TaskStatus.UNDER_REVIEW,
        targetStatus: TaskStatus.COMPLETED,
      }),
    );

    repository.review!.mockResolvedValue({
      task: makeTask({ status: TaskStatus.IN_PROGRESS }),
      review: {},
    });
    await service.review(
      ACTOR,
      "task-1",
      { outcome: TaskReviewOutcome.CHANGES_REQUESTED },
      "request-2",
    );
    expect(repository.review).toHaveBeenLastCalledWith(
      expect.objectContaining({ targetStatus: TaskStatus.IN_PROGRESS }),
    );
  });

  it("forbids an assignee from reviewing their own submitted task", async () => {
    // A Department Manager assigned their own task by Super Admin now holds
    // `task.review` (their own department) alongside the new self-report
    // grants - without this guard they could approve their own submission
    // instead of it genuinely reaching Super Admin.
    grantOnly(["task.review", "DEPARTMENT"]);
    repository.findVisibleById!.mockResolvedValue(
      makeTask({
        status: TaskStatus.UNDER_REVIEW,
        assignees: [
          {
            id: ACTOR,
            email: "actor@example.com",
            firstName: null,
            lastName: null,
            assignedAt: new Date(),
          },
        ],
      }),
    );
    await expectCode(
      service.review(
        ACTOR,
        "task-1",
        { outcome: TaskReviewOutcome.APPROVED },
        "request-1",
      ),
      "PERMISSION_DENIED",
    );
    expect(repository.review).not.toHaveBeenCalled();
  });

  it("rejects an invalid create schedule before persistence", async () => {
    grantOnly(["task.create", "ORGANIZATION"]);
    await expectCode(
      service.create(
        ACTOR,
        {
          title: "x",
          departmentId: "department-1",
          startAt: "2026-04-02T00:00:00.000Z",
          dueAt: "2026-04-01T00:00:00.000Z",
        },
        "request-1",
      ),
      "TASK_SCHEDULE_INVALID",
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("requires an explicit workspace or department owner", async () => {
    grantOnly(["task.create", "ORGANIZATION"]);
    await expectCode(
      service.create(ACTOR, { title: "ownerless" }, "request-1"),
      "TASK_OWNER_REQUIRED",
    );
  });

  it("maps a missing mentioned user to TASK_USER_NOT_FOUND", async () => {
    grantOnly(["task.comment.create", "SELF"]);
    repository.findVisibleById!.mockResolvedValue(
      makeTask({
        createdBy: {
          id: ACTOR,
          email: "actor@example.com",
          firstName: null,
          lastName: null,
        },
      }),
    );
    repository.createComment!.mockResolvedValue("user_not_found");
    await expectCode(
      service.createComment(ACTOR, "task-1", {
        content: "hello",
        mentionedUserIds: ["ghost"],
      }),
      "TASK_USER_NOT_FOUND",
    );
  });

  it("persists every allowed assignee lifecycle transition", async () => {
    grantOnly(["task.update_status", "SELF"]);
    const transitions: Array<[TaskStatus, TaskStatus]> = [
      [TaskStatus.TODO, TaskStatus.IN_PROGRESS],
      [TaskStatus.TODO, TaskStatus.BLOCKED],
      [TaskStatus.TODO, TaskStatus.CANCELLED],
      [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED],
      [TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
      [TaskStatus.BLOCKED, TaskStatus.TODO],
      [TaskStatus.BLOCKED, TaskStatus.IN_PROGRESS],
      [TaskStatus.BLOCKED, TaskStatus.CANCELLED],
    ];

    for (const [from, to] of transitions) {
      repository.findVisibleById!.mockResolvedValue(
        makeTask({
          status: from,
          createdBy: {
            id: ACTOR,
            email: "actor@example.com",
            firstName: null,
            lastName: null,
          },
        }),
      );
      repository.setStatus!.mockResolvedValue(makeTask({ status: to }));

      await expect(
        service.transition(ACTOR, "task-1", to),
      ).resolves.toMatchObject({
        status: to,
      });
      expect(repository.setStatus).toHaveBeenLastCalledWith(
        "task-1",
        from,
        to,
        ACTOR,
        expect.any(Object),
        undefined,
      );
    }
  });

  it("enforces each assignee lifecycle boundary before attempting persistence", async () => {
    grantOnly(["task.update_status", "SELF"]);
    repository.findVisibleById!.mockResolvedValue(
      makeTask({
        status: TaskStatus.TODO,
        createdBy: {
          id: ACTOR,
          email: "actor@example.com",
          firstName: null,
          lastName: null,
        },
      }),
    );

    await service.transition(ACTOR, "task-1", TaskStatus.BLOCKED);
    expect(repository.setStatus).toHaveBeenCalledWith(
      "task-1",
      TaskStatus.TODO,
      TaskStatus.BLOCKED,
      ACTOR,
      expect.any(Object),
      undefined,
    );

    repository.setStatus!.mockClear();
    await expectCode(
      service.transition(ACTOR, "task-1", TaskStatus.COMPLETED),
      "TASK_INVALID_TRANSITION",
    );
    expect(repository.setStatus).not.toHaveBeenCalled();

    repository.findVisibleById!.mockResolvedValue(
      makeTask({
        status: TaskStatus.COMPLETED,
        createdBy: {
          id: ACTOR,
          email: "actor@example.com",
          firstName: null,
          lastName: null,
        },
      }),
    );
    await expectCode(
      service.transition(ACTOR, "task-1", TaskStatus.IN_PROGRESS),
      "TASK_INVALID_TRANSITION",
    );
  });

  it("maps concurrent status writes to a stable conflict", async () => {
    grantOnly(["task.update_status", "SELF"]);
    repository.findVisibleById!.mockResolvedValue(
      makeTask({
        createdBy: {
          id: ACTOR,
          email: "actor@example.com",
          firstName: null,
          lastName: null,
        },
      }),
    );
    repository.setStatus!.mockResolvedValue("concurrent");
    await expectCode(
      service.transition(ACTOR, "task-1", TaskStatus.IN_PROGRESS),
      "TASK_CONCURRENT_CHANGE",
    );
  });

  it("requires task.update to add a checklist item", async () => {
    grantOnly(["task.read", "SELF"]);
    repository.findVisibleById!.mockResolvedValue(null);
    await expectCode(
      service.addChecklistItem(ACTOR, "task-1", {
        description: "Confirm venue permits",
      }),
      "PERMISSION_DENIED",
    );
    expect(repository.createChecklistItem).not.toHaveBeenCalled();

    grantOnly(["task.update", "SELF"]);
    repository.findVisibleById!.mockResolvedValue(
      makeTask({
        assignees: [
          {
            id: ACTOR,
            email: "actor@example.com",
            firstName: null,
            lastName: null,
            assignedAt: new Date(),
          },
        ],
      }),
    );
    await service.addChecklistItem(ACTOR, "task-1", {
      description: "Confirm venue permits",
    });
    expect(repository.createChecklistItem).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task-1",
        description: "Confirm venue permits",
        actorId: ACTOR,
      }),
    );
  });

  it("toggles a checklist item under task.update_progress and maps concurrent/not-found outcomes", async () => {
    grantOnly(["task.update_progress", "SELF"]);
    repository.findVisibleById!.mockResolvedValue(
      makeTask({
        assignees: [
          {
            id: ACTOR,
            email: "actor@example.com",
            firstName: null,
            lastName: null,
            assignedAt: new Date(),
          },
        ],
      }),
    );

    repository.setChecklistItemCompletion!.mockResolvedValue("concurrent");
    await expectCode(
      service.toggleChecklistItem(ACTOR, "task-1", "item-1", true),
      "TASK_CONCURRENT_CHANGE",
    );

    repository.setChecklistItemCompletion!.mockResolvedValue("not_found");
    await expectCode(
      service.toggleChecklistItem(ACTOR, "task-1", "missing-item", true),
      "TASK_CHECKLIST_ITEM_NOT_FOUND",
    );
  });

  it("rejects a reorder list that does not exactly match the task's current items", async () => {
    grantOnly(["task.update", "SELF"]);
    repository.findVisibleById!.mockResolvedValue(
      makeTask({
        createdBy: {
          id: ACTOR,
          email: "actor@example.com",
          firstName: null,
          lastName: null,
        },
      }),
    );
    repository.reorderChecklistItems!.mockResolvedValue("mismatch");
    await expectCode(
      service.reorderChecklistItems(ACTOR, "task-1", {
        orderedItemIds: ["item-1"],
      }),
      "TASK_CHECKLIST_REORDER_MISMATCH",
    );
  });

  it("maps a repository ownership denial to TASK_CHECKLIST_ITEM_OWNERSHIP_DENIED for both edit and remove", async () => {
    grantOnly(["task.update", "DEPARTMENT"]);
    repository.findVisibleById!.mockResolvedValue(makeTask());
    repository.updateChecklistItem!.mockResolvedValue("ownership_denied");
    await expectCode(
      service.updateChecklistItem(ACTOR, "task-1", "item-1", {
        description: "Rewritten",
      }),
      "TASK_CHECKLIST_ITEM_OWNERSHIP_DENIED",
    );
    expect(repository.updateChecklistItem).toHaveBeenCalledWith(
      expect.objectContaining({ actorIsOrganizationScoped: false }),
    );

    repository.removeChecklistItem!.mockResolvedValue("ownership_denied");
    await expectCode(
      service.removeChecklistItem(ACTOR, "task-1", "item-1"),
      "TASK_CHECKLIST_ITEM_OWNERSHIP_DENIED",
    );
  });

  it("passes organization scope through to the repository's legacy-item fallback check", async () => {
    grantOnly(["task.update", "ORGANIZATION"]);
    repository.findVisibleById!.mockResolvedValue(makeTask());
    await service.updateChecklistItem(ACTOR, "task-1", "item-1", {
      description: "Edited",
    });
    expect(repository.updateChecklistItem).toHaveBeenCalledWith(
      expect.objectContaining({ actorIsOrganizationScoped: true }),
    );
  });

  it("maps assignment removal and missing users without exposing persistence details", async () => {
    grantOnly(["task.assign", "ORGANIZATION"]);
    repository.removeAssignee!.mockResolvedValue("not_assigned");
    await expectCode(
      service.removeAssignee(ACTOR, "task-1", "user-1", "request-1"),
      "TASK_ASSIGNEE_NOT_ASSIGNED",
    );

    repository.addAssignee!.mockResolvedValue("user_not_found");
    await expectCode(
      service.addAssignee(ACTOR, "task-1", "user-1", "request-2"),
      "TASK_USER_NOT_FOUND",
    );
  });

  it("rejects inaccessible owners and missing owner records before creating a task", async () => {
    grantOnly(["task.create", "DEPARTMENT"]);
    repository.findUserDepartmentId!.mockResolvedValue("department-1");
    await expectCode(
      service.create(
        ACTOR,
        {
          title: "Other department task",
          departmentId: "department-2",
        },
        "request-1",
      ),
      "PERMISSION_DENIED",
    );
    expect(repository.create).not.toHaveBeenCalled();

    grantOnly(["task.create", "ORGANIZATION"]);
    repository.workspaceExists!.mockResolvedValue(false);
    await expectCode(
      service.create(
        ACTOR,
        {
          title: "Missing workspace task",
          workspaceId: "workspace-1",
        },
        "request-2",
      ),
      "TASK_WORKSPACE_NOT_FOUND",
    );
  });

  it("rejects creating a task for an assignee outside the chosen department", async () => {
    grantOnly(["task.create", "ORGANIZATION"], ["task.assign", "ORGANIZATION"]);
    repository.listEligibleAssignees!.mockResolvedValue([
      {
        id: "eligible-user",
        email: "e@example.com",
        firstName: null,
        lastName: null,
      },
    ]);
    await expectCode(
      service.create(
        ACTOR,
        {
          title: "Cross-department assignment",
          departmentId: "department-1",
          assigneeId: "outside-user",
        },
        "request-3",
      ),
      "TASK_ASSIGNEE_OUTSIDE_DEPARTMENT",
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("creates and assigns a task in one call when the assignee is eligible", async () => {
    grantOnly(
      ["task.create", "ORGANIZATION"],
      ["task.assign", "ORGANIZATION"],
      ["task.read", "ORGANIZATION"],
    );
    repository.listEligibleAssignees!.mockResolvedValue([
      {
        id: "eligible-user",
        email: "e@example.com",
        firstName: null,
        lastName: null,
      },
    ]);
    await service.create(
      ACTOR,
      {
        title: "Confirm venue",
        departmentId: "department-1",
        assigneeId: "eligible-user",
        type: "LOGISTICS",
      },
      "request-4",
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "LOGISTICS" }),
    );
    expect(repository.addAssignee).toHaveBeenCalledWith(
      "task-1",
      "eligible-user",
      ACTOR,
      expect.anything(),
      "request-4",
    );
  });

  it("lets a Department Manager who is the parent's own assignee create a subordinate task, inheriting its department", async () => {
    grantOnly(["task.create", "DEPARTMENT"], ["task.read", "DEPARTMENT"]);
    repository.findById!.mockResolvedValueOnce(
      makeTask({
        id: "parent-1",
        departmentId: "department-1",
        assignees: [
          {
            id: ACTOR,
            email: "manager@example.com",
            firstName: null,
            lastName: null,
            assignedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
      }),
    );
    await service.create(
      ACTOR,
      {
        title: "Draft the social copy",
        parentTaskId: "parent-1",
        // A client-supplied department must never override the parent's own.
        departmentId: "some-other-department",
      },
      "request-6",
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        parentTaskId: "parent-1",
        departmentId: "department-1",
      }),
    );
  });

  it("rejects a peer Department Manager who is not the parent's own assignee from creating a subordinate task", async () => {
    grantOnly(["task.create", "DEPARTMENT"], ["task.read", "DEPARTMENT"]);
    repository.findById!.mockResolvedValueOnce(
      makeTask({
        id: "parent-1",
        departmentId: "department-1",
        assignees: [
          {
            id: "a-different-manager",
            email: "other-manager@example.com",
            firstName: null,
            lastName: null,
            assignedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
      }),
    );
    await expectCode(
      service.create(
        ACTOR,
        { title: "Draft the social copy", parentTaskId: "parent-1" },
        "request-7",
      ),
      "PERMISSION_DENIED",
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("lets an organization-scoped caller create a subordinate task under any parent regardless of its assignees", async () => {
    grantOnly(["task.create", "ORGANIZATION"], ["task.read", "ORGANIZATION"]);
    repository.findById!.mockResolvedValueOnce(
      makeTask({
        id: "parent-1",
        departmentId: "department-1",
        assignees: [],
      }),
    );
    await service.create(
      ACTOR,
      { title: "Super Admin follow-up", parentTaskId: "parent-1" },
      "request-8",
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ parentTaskId: "parent-1" }),
    );
  });

  it("maps a cross-department assignee to TASK_ASSIGNEE_OUTSIDE_DEPARTMENT on direct assignment", async () => {
    grantOnly(["task.assign", "DEPARTMENT"]);
    repository.addAssignee!.mockResolvedValue("assignee_outside_department");
    await expectCode(
      service.addAssignee(ACTOR, "task-1", "outside-user", "request-5"),
      "TASK_ASSIGNEE_OUTSIDE_DEPARTMENT",
    );
  });

  it("scopes listEligibleAssignees to the actor's own department for a Department Manager", async () => {
    grantOnly(["task.create", "DEPARTMENT"]);
    repository.findUserDepartmentId!.mockResolvedValue("department-1");
    await expectCode(
      service.listEligibleAssignees(ACTOR, "department-2"),
      "PERMISSION_DENIED",
    );

    repository.listEligibleAssignees!.mockResolvedValue([
      { id: "user-1", email: "u@example.com", firstName: null, lastName: null },
    ]);
    await expect(
      service.listEligibleAssignees(ACTOR, "department-1"),
    ).resolves.toEqual([
      { id: "user-1", email: "u@example.com", firstName: null, lastName: null },
    ]);
  });
});
