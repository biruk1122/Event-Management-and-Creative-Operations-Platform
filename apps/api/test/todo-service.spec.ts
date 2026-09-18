import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PermissionScope } from "../src/generated/prisma/client.js";
import type { TodoRecord } from "../src/todo/infrastructure/todo.repository.js";
import { TodoService } from "../src/todo/todo.service.js";

const ACTOR = "00000000-0000-0000-0000-000000000001";
const TODO_ID = "00000000-0000-0000-0000-000000000002";
const EVENT_ID = "00000000-0000-0000-0000-000000000003";

function makeTodo(overrides: Partial<TodoRecord> = {}): TodoRecord {
  return {
    id: TODO_ID,
    userId: ACTOR,
    title: "Confirm venue",
    description: null,
    type: "PERSONAL",
    priority: "MEDIUM",
    status: "NOT_STARTED",
    dueDate: null,
    dueTime: null,
    relatedEventId: null,
    relatedProjectId: null,
    reminderEnabled: false,
    createdById: ACTOR,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    reminders: [],
    ...overrides,
  };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(HttpException);
  await promise.catch((error: unknown) => {
    expect(
      ((error as HttpException).getResponse() as { code?: string }).code,
    ).toBe(code);
  });
}

describe("TodoService", () => {
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
  let service: TodoService;

  beforeEach(() => {
    repository = {
      list: vi.fn().mockResolvedValue([]),
      findOwned: vi.fn().mockResolvedValue(makeTodo()),
      create: vi.fn().mockResolvedValue(makeTodo()),
      updateOwned: vi.fn().mockResolvedValue(makeTodo()),
      deleteOwned: vi.fn().mockResolvedValue(true),
      eventExists: vi.fn().mockResolvedValue(true),
      projectExists: vi.fn().mockResolvedValue(true),
    };
    permissions = { hasGrant: vi.fn().mockResolvedValue(true) };
    service = new TodoService(repository as never, permissions as never);
  });

  it.each([
    ["list", "todo.read", (s: TodoService) => s.list(ACTOR, {})],
    ["get", "todo.read", (s: TodoService) => s.get(ACTOR, TODO_ID)],
    [
      "create",
      "todo.create",
      (s: TodoService) => s.create(ACTOR, { title: "x" }),
    ],
    ["update", "todo.update", (s: TodoService) => s.update(ACTOR, TODO_ID, {})],
    ["remove", "todo.delete", (s: TodoService) => s.remove(ACTOR, TODO_ID)],
  ] as const)("%s requires %s at SELF scope", async (_label, key, call) => {
    permissions.hasGrant.mockResolvedValue(false);
    await expectCode(call(service), "PERMISSION_DENIED");
    expect(permissions.hasGrant).toHaveBeenCalledWith(ACTOR, key, "SELF");
  });

  it("defaults type, priority, and status on create", async () => {
    await service.create(ACTOR, { title: " Confirm venue " });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Confirm venue",
        type: "PERSONAL",
        priority: "MEDIUM",
        status: "NOT_STARTED",
      }),
    );
  });

  it("rejects a due time without a due date on create", async () => {
    await expectCode(
      service.create(ACTOR, { title: "x", dueTime: "09:00" }),
      "TODO_SCHEDULE_INVALID",
    );
    expect(repository.create).not.toHaveBeenCalled();

    await service.create(ACTOR, {
      title: "x",
      dueDate: "2026-05-01",
      dueTime: "09:00",
    });
    expect(repository.create).toHaveBeenCalled();
  });

  it("rejects a due time without a due date on update, using the merged state", async () => {
    // Current has a due date; clearing it while a time is also supplied
    // must fail even though neither field alone would.
    repository.findOwned!.mockResolvedValue(
      makeTodo({ dueDate: new Date("2026-05-01T00:00:00.000Z") }),
    );
    await expectCode(
      service.update(ACTOR, TODO_ID, { dueDate: null, dueTime: "09:00" }),
      "TODO_SCHEDULE_INVALID",
    );
    expect(repository.updateOwned).not.toHaveBeenCalled();

    // Current already has a due date; setting only a time is fine.
    await service.update(ACTOR, TODO_ID, { dueTime: "09:00" });
    expect(repository.updateOwned).toHaveBeenCalled();
  });

  it("validates a related event or project exists before creating or updating", async () => {
    repository.eventExists!.mockResolvedValue(false);
    await expectCode(
      service.create(ACTOR, { title: "x", relatedEventId: EVENT_ID }),
      "TODO_RELATED_EVENT_NOT_FOUND",
    );
    expect(repository.create).not.toHaveBeenCalled();

    repository.projectExists!.mockResolvedValue(false);
    await expectCode(
      service.update(ACTOR, TODO_ID, { relatedProjectId: EVENT_ID }),
      "TODO_RELATED_PROJECT_NOT_FOUND",
    );
    expect(repository.updateOwned).not.toHaveBeenCalled();
  });

  it("does not re-validate a related record when clearing or leaving it unchanged", async () => {
    await service.update(ACTOR, TODO_ID, { relatedEventId: null });
    expect(repository.eventExists).not.toHaveBeenCalled();
    expect(repository.updateOwned).toHaveBeenCalled();
  });

  it("passes reminderAt through to the repository distinguishing unset, clear, and set", async () => {
    await service.create(ACTOR, { title: "x" });
    const [createArgs] = repository.create!.mock.calls.at(-1) as [
      Record<string, unknown>,
    ];
    expect(createArgs).not.toHaveProperty("reminderAt");

    await service.update(ACTOR, TODO_ID, {});
    expect(repository.updateOwned).toHaveBeenLastCalledWith(
      TODO_ID,
      ACTOR,
      expect.anything(),
      undefined,
    );

    await service.update(ACTOR, TODO_ID, { reminderAt: null });
    expect(repository.updateOwned).toHaveBeenLastCalledWith(
      TODO_ID,
      ACTOR,
      expect.anything(),
      null,
    );

    await service.update(ACTOR, TODO_ID, {
      reminderAt: "2026-05-01T09:00:00.000Z",
    });
    expect(repository.updateOwned).toHaveBeenLastCalledWith(
      TODO_ID,
      ACTOR,
      expect.anything(),
      new Date("2026-05-01T09:00:00.000Z"),
    );
  });

  it("maps a missing or foreign-owned to-do to the stable not-found response", async () => {
    repository.findOwned!.mockResolvedValue(null);
    await expectCode(service.get(ACTOR, TODO_ID), "TODO_NOT_FOUND");

    repository.updateOwned!.mockResolvedValue(null);
    await expectCode(
      service.update(ACTOR, TODO_ID, { title: "x" }),
      "TODO_NOT_FOUND",
    );

    repository.deleteOwned!.mockResolvedValue(false);
    await expectCode(service.remove(ACTOR, TODO_ID), "TODO_NOT_FOUND");
  });

  it("formats the response, including the single most recent reminder", async () => {
    repository.findOwned!.mockResolvedValue(
      makeTodo({
        dueDate: new Date("2026-05-01T00:00:00.000Z"),
        dueTime: new Date("1970-01-01T09:30:00.000Z"),
        reminderEnabled: true,
        reminders: [
          { reminderAt: new Date("2026-04-30T09:00:00.000Z"), sent: false },
        ],
      }),
    );
    const response = await service.get(ACTOR, TODO_ID);
    expect(response).toMatchObject({
      dueDate: "2026-05-01",
      dueTime: "09:30:00",
      reminderEnabled: true,
      reminderAt: "2026-04-30T09:00:00.000Z",
    });
  });
});
