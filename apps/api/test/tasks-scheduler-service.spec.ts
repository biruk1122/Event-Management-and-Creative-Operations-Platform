import { beforeEach, describe, expect, it, vi } from "vitest";

import { OutboxActorKind } from "../src/generated/prisma/client.js";
import { TasksSchedulerService } from "../src/tasks/tasks-scheduler.service.js";

const DUE_AT = new Date("2026-02-01T09:00:00.000Z");

describe("TasksSchedulerService", () => {
  let db: { $transaction: ReturnType<typeof vi.fn> };
  let repository: Record<string, ReturnType<typeof vi.fn>>;
  let outbox: { append: ReturnType<typeof vi.fn> };
  let service: TasksSchedulerService;

  beforeEach(() => {
    db = {
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
    };
    repository = {
      findDueCandidates: vi.fn().mockResolvedValue([]),
      findOverdueCandidates: vi.fn().mockResolvedValue([]),
      tryClaim: vi.fn().mockResolvedValue(true),
    };
    outbox = { append: vi.fn().mockResolvedValue(undefined) };
    service = new TasksSchedulerService(
      db as never,
      repository as never,
      outbox as never,
    );
  });

  async function tick(): Promise<void> {
    await (service as unknown as { tick(): Promise<void> }).tick();
  }

  it("claims and appends a task.due event for each due candidate", async () => {
    repository.findDueCandidates!.mockResolvedValue([
      { id: "task-1", dueAt: DUE_AT },
    ]);
    await tick();

    expect(repository.tryClaim).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        ruleName: "task.due",
        ruleVersion: 1,
        resourceId: "task-1",
        scheduledFor: DUE_AT,
      }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        name: "task.due",
        actorKind: OutboxActorKind.SYSTEM,
        resourceType: "task",
        resourceId: "task-1",
        payload: {
          occurrenceKey: `task-1:${DUE_AT.toISOString()}:task.due:v1`,
        },
        consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
      }),
    );
  });

  it("does not append an outbox event when the occurrence is already claimed", async () => {
    repository.findDueCandidates!.mockResolvedValue([
      { id: "task-1", dueAt: DUE_AT },
    ]);
    repository.tryClaim!.mockResolvedValue(false);
    await tick();

    expect(outbox.append).not.toHaveBeenCalled();
  });

  it("queries overdue candidates against the due rule's name and version", async () => {
    await tick();
    expect(repository.findOverdueCandidates).toHaveBeenCalledWith(
      expect.any(Date),
      "task.due",
      1,
    );
  });

  it("claims and appends a task.overdue event for each overdue candidate", async () => {
    repository.findOverdueCandidates!.mockResolvedValue([
      { id: "task-2", dueAt: DUE_AT },
    ]);
    await tick();

    expect(outbox.append).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        name: "task.overdue",
        resourceId: "task-2",
        payload: {
          occurrenceKey: `task-2:${DUE_AT.toISOString()}:task.overdue:v1`,
        },
      }),
    );
  });

  it("queries overdue candidates before writing this tick's own due claims, so a task can never be both in the same tick", async () => {
    const callOrder: string[] = [];
    repository.findOverdueCandidates = vi.fn(() => {
      callOrder.push("findOverdueCandidates");
      return Promise.resolve([]);
    });
    repository.findDueCandidates = vi.fn(() => {
      callOrder.push("findDueCandidates");
      return Promise.resolve([{ id: "task-1", dueAt: DUE_AT }]);
    });
    repository.tryClaim = vi.fn(() => {
      callOrder.push("tryClaim");
      return Promise.resolve(true);
    });

    await tick();

    // findOverdueCandidates must run - and its result be fixed - before the
    // due loop claims anything this tick, otherwise a task becoming due
    // right now would also be picked up as overdue in the same tick.
    expect(callOrder).toEqual([
      "findOverdueCandidates",
      "findDueCandidates",
      "tryClaim",
    ]);
  });

  it("does not let an overlapping tick run concurrently", async () => {
    let resolveFind!: () => void;
    repository.findDueCandidates!.mockReturnValue(
      new Promise((resolve) => {
        resolveFind = () => resolve([]);
      }),
    );
    const first = tick();
    const second = tick();
    resolveFind();
    await Promise.all([first, second]);

    expect(repository.findDueCandidates).toHaveBeenCalledTimes(1);
  });
});
