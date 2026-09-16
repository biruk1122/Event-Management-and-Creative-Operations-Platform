import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient, TaskStatus } from "../src/generated/prisma/client.js";
import { TasksSchedulerRepository } from "../src/tasks/infrastructure/tasks-scheduler.repository.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

/**
 * EVE-207 - verifies `TasksSchedulerRepository`'s candidate queries and
 * claim uniqueness (ADR 0003 §3: database-backed claims, not process-local
 * timers) against a real isolated PostgreSQL 18 schema.
 */
describe("tasks scheduler persistence", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let repository: TasksSchedulerRepository;

  let departmentId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: db.url },
        { schema: db.schema },
      ),
    });
    repository = new TasksSchedulerRepository(prisma as never);

    departmentId = (
      await prisma.department.create({ data: { name: "Scheduler QA" } })
    ).id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  let counter = 0;
  async function makeTask(input: {
    dueAt: Date | null;
    status?: TaskStatus;
  }): Promise<string> {
    counter += 1;
    const task = await prisma.task.create({
      data: {
        title: `Task ${counter}`,
        departmentId,
        dueAt: input.dueAt,
        status: input.status ?? TaskStatus.TODO,
      },
    });
    return task.id;
  }

  describe("findDueCandidates", () => {
    it("includes a nonterminal task whose dueAt has been reached", async () => {
      const now = new Date("2026-03-01T12:00:00.000Z");
      const past = new Date("2026-03-01T09:00:00.000Z");
      const taskId = await makeTask({ dueAt: past });

      const candidates = await repository.findDueCandidates(now);
      expect(candidates.map((c) => c.id)).toContain(taskId);
      const match = candidates.find((c) => c.id === taskId);
      expect(match?.dueAt.getTime()).toBe(past.getTime());
    });

    it("excludes a terminal task, a future dueAt, and a null dueAt", async () => {
      const now = new Date("2026-03-02T12:00:00.000Z");
      const past = new Date("2026-03-02T09:00:00.000Z");
      const future = new Date("2026-03-02T18:00:00.000Z");

      const completed = await makeTask({
        dueAt: past,
        status: TaskStatus.COMPLETED,
      });
      const cancelled = await makeTask({
        dueAt: past,
        status: TaskStatus.CANCELLED,
      });
      const notYetDue = await makeTask({ dueAt: future });
      const noDueDate = await makeTask({ dueAt: null });

      const candidates = await repository.findDueCandidates(now);
      const ids = candidates.map((c) => c.id);
      expect(ids).not.toContain(completed);
      expect(ids).not.toContain(cancelled);
      expect(ids).not.toContain(notYetDue);
      expect(ids).not.toContain(noDueDate);
    });
  });

  describe("findOverdueCandidates", () => {
    it("only includes a task whose TASK_DUE occurrence for the same dueAt is already claimed", async () => {
      const now = new Date("2026-03-03T12:00:00.000Z");
      const past = new Date("2026-03-03T09:00:00.000Z");

      const claimedTask = await makeTask({ dueAt: past });
      const unclaimedTask = await makeTask({ dueAt: past });

      await prisma.$transaction((tx) =>
        repository.tryClaim(tx as never, {
          ruleName: "task.due",
          ruleVersion: 1,
          resourceId: claimedTask,
          scheduledFor: past,
        }),
      );

      const candidates = await repository.findOverdueCandidates(
        now,
        "task.due",
        1,
      );
      const ids = candidates.map((c) => c.id);
      expect(ids).toContain(claimedTask);
      expect(ids).not.toContain(unclaimedTask);
    });

    it("excludes a task whose dueAt has not passed, even if claimed", async () => {
      const now = new Date("2026-03-04T09:00:00.000Z");
      const future = new Date("2026-03-04T18:00:00.000Z");
      const taskId = await makeTask({ dueAt: future });

      await prisma.$transaction((tx) =>
        repository.tryClaim(tx as never, {
          ruleName: "task.due",
          ruleVersion: 1,
          resourceId: taskId,
          scheduledFor: future,
        }),
      );

      const candidates = await repository.findOverdueCandidates(
        now,
        "task.due",
        1,
      );
      expect(candidates.map((c) => c.id)).not.toContain(taskId);
    });
  });

  describe("tryClaim", () => {
    it("claims once, then reports the exact same occurrence as already claimed", async () => {
      const taskId = await makeTask({
        dueAt: new Date("2026-03-05T09:00:00.000Z"),
      });
      const scheduledFor = new Date("2026-03-05T09:00:00.000Z");

      const first = await prisma.$transaction((tx) =>
        repository.tryClaim(tx as never, {
          ruleName: "task.due",
          ruleVersion: 1,
          resourceId: taskId,
          scheduledFor,
        }),
      );
      expect(first).toBe(true);

      const second = await prisma.$transaction((tx) =>
        repository.tryClaim(tx as never, {
          ruleName: "task.due",
          ruleVersion: 1,
          resourceId: taskId,
          scheduledFor,
        }),
      );
      expect(second).toBe(false);

      expect(
        await prisma.scheduledOccurrenceClaim.count({
          where: { resourceId: taskId },
        }),
      ).toBe(1);
    });

    it("allows a distinct claim for the same task at a different scheduledFor (reschedule safety)", async () => {
      const taskId = await makeTask({
        dueAt: new Date("2026-03-06T09:00:00.000Z"),
      });

      const firstInstant = new Date("2026-03-06T09:00:00.000Z");
      const rescheduledInstant = new Date("2026-03-07T09:00:00.000Z");

      const first = await prisma.$transaction((tx) =>
        repository.tryClaim(tx as never, {
          ruleName: "task.due",
          ruleVersion: 1,
          resourceId: taskId,
          scheduledFor: firstInstant,
        }),
      );
      const second = await prisma.$transaction((tx) =>
        repository.tryClaim(tx as never, {
          ruleName: "task.due",
          ruleVersion: 1,
          resourceId: taskId,
          scheduledFor: rescheduledInstant,
        }),
      );

      expect(first).toBe(true);
      expect(second).toBe(true);
    });
  });
});
