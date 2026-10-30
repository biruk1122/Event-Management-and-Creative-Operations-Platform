import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  EventStatus,
  PrismaClient,
  WorkspaceKind,
} from "../src/generated/prisma/client.js";
import { EventsSchedulerRepository } from "../src/events/infrastructure/events-scheduler.repository.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

/**
 * Verifies `EventsSchedulerRepository`'s candidate query (a status
 * exclusion-list, not Meeting's single-status allowlist) and
 * `ScheduledOccurrenceClaim` uniqueness/reschedule-safety against a real
 * isolated PostgreSQL schema.
 */
describe("events scheduler persistence", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let repository: EventsSchedulerRepository;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: db.url },
        { schema: db.schema },
      ),
    });
    repository = new EventsSchedulerRepository(prisma as never);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  let counter = 0;
  async function makeEvent(input: {
    startAt: Date;
    reminderAt: Date | null;
    status?: EventStatus;
  }): Promise<string> {
    counter += 1;
    const workspace = await prisma.workspace.create({
      data: { kind: WorkspaceKind.EVENT },
    });
    const event = await prisma.event.create({
      data: {
        name: `Event ${counter}`,
        eventType: "CONCERT",
        workspaceId: workspace.id,
        startAt: input.startAt,
        reminderAt: input.reminderAt,
        status: input.status ?? EventStatus.PLANNING,
      },
    });
    return event.id;
  }

  describe("findReminderCandidates", () => {
    it("includes a nonterminal event whose reminderAt has been reached", async () => {
      const now = new Date("2026-03-01T12:00:00.000Z");
      const past = new Date("2026-03-01T09:00:00.000Z");
      const start = new Date("2026-03-02T09:00:00.000Z");
      const eventId = await makeEvent({ startAt: start, reminderAt: past });

      const candidates = await repository.findReminderCandidates(now);
      expect(candidates.map((c) => c.id)).toContain(eventId);
      const match = candidates.find((c) => c.id === eventId);
      expect(match?.reminderAt.getTime()).toBe(past.getTime());
    });

    it("excludes a Completed or Cancelled event, a future reminderAt, and a null reminderAt", async () => {
      const now = new Date("2026-03-02T12:00:00.000Z");
      const past = new Date("2026-03-02T09:00:00.000Z");
      const future = new Date("2026-03-02T18:00:00.000Z");
      const start = new Date("2026-03-03T09:00:00.000Z");

      const completed = await makeEvent({
        startAt: start,
        reminderAt: past,
        status: EventStatus.COMPLETED,
      });
      const cancelled = await makeEvent({
        startAt: start,
        reminderAt: past,
        status: EventStatus.CANCELLED,
      });
      const notYetDue = await makeEvent({ startAt: start, reminderAt: future });
      const noReminder = await makeEvent({ startAt: start, reminderAt: null });

      const candidates = await repository.findReminderCandidates(now);
      const ids = candidates.map((c) => c.id);
      expect(ids).not.toContain(completed);
      expect(ids).not.toContain(cancelled);
      expect(ids).not.toContain(notYetDue);
      expect(ids).not.toContain(noReminder);
    });

    it("includes an in-progress or ready event (not just PLANNING)", async () => {
      const now = new Date("2026-03-05T12:00:00.000Z");
      const past = new Date("2026-03-05T09:00:00.000Z");
      const start = new Date("2026-03-06T09:00:00.000Z");
      const ready = await makeEvent({
        startAt: start,
        reminderAt: past,
        status: EventStatus.READY,
      });
      const inProgress = await makeEvent({
        startAt: start,
        reminderAt: past,
        status: EventStatus.IN_PROGRESS,
      });

      const ids = (await repository.findReminderCandidates(now)).map(
        (c) => c.id,
      );
      expect(ids).toContain(ready);
      expect(ids).toContain(inProgress);
    });
  });

  describe("tryClaim", () => {
    it("claims once, then reports the exact same occurrence as already claimed", async () => {
      const reminderAt = new Date("2026-03-07T09:00:00.000Z");
      const eventId = await makeEvent({
        startAt: new Date("2026-03-08T09:00:00.000Z"),
        reminderAt,
      });

      const first = await prisma.$transaction((tx) =>
        repository.tryClaim(tx as never, { id: eventId, reminderAt }),
      );
      expect(first).toBe(true);

      const second = await prisma.$transaction((tx) =>
        repository.tryClaim(tx as never, { id: eventId, reminderAt }),
      );
      expect(second).toBe(false);

      expect(
        await prisma.scheduledOccurrenceClaim.count({
          where: { resourceId: eventId, ruleName: "event.reminder" },
        }),
      ).toBe(1);
    });

    it("allows a distinct claim for the same event at a different reminderAt (reschedule safety)", async () => {
      const eventId = await makeEvent({
        startAt: new Date("2026-03-10T09:00:00.000Z"),
        reminderAt: new Date("2026-03-09T09:00:00.000Z"),
      });

      const first = await prisma.$transaction((tx) =>
        repository.tryClaim(tx as never, {
          id: eventId,
          reminderAt: new Date("2026-03-09T09:00:00.000Z"),
        }),
      );
      const second = await prisma.$transaction((tx) =>
        repository.tryClaim(tx as never, {
          id: eventId,
          reminderAt: new Date("2026-03-09T18:00:00.000Z"),
        }),
      );

      expect(first).toBe(true);
      expect(second).toBe(true);
    });
  });
});
