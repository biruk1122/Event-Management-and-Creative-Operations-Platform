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
    title: "Permits",
    description: null,
    priority: "MEDIUM",
    status: TaskStatus.TODO,
    progress: 0,
    startAt: null,
    dueAt: null,
    assignees: [],
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
      setProgress: vi
        .fn()
        .mockImplementation((_id: string, _from: number, to: number) =>
          Promise.resolve(makeTask({ progress: to })),
        ),
      review: vi.fn().mockResolvedValue({
        task: makeTask({ status: TaskStatus.COMPLETED }),
        review: {},
      }),
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

  it("rejects an invalid create schedule before persistence", async () => {
    grantOnly(["task.create", "ORGANIZATION"]);
    await expectCode(
      service.create(ACTOR, {
        title: "x",
        departmentId: "department-1",
        startAt: "2026-04-02T00:00:00.000Z",
        dueAt: "2026-04-01T00:00:00.000Z",
      }),
      "TASK_SCHEDULE_INVALID",
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("requires an explicit workspace or department owner", async () => {
    grantOnly(["task.create", "ORGANIZATION"]);
    await expectCode(
      service.create(ACTOR, { title: "ownerless" }),
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
});
