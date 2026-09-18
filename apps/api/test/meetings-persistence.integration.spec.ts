import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CalendarEntryType,
  MeetingParticipantResponse,
  MeetingStatus,
  OutboxDeliveryStatus,
  PrismaClient,
} from "../src/generated/prisma/client.js";
import { MeetingsRepository } from "../src/meetings/infrastructure/meetings.repository.js";
import { MeetingsSchedulerRepository } from "../src/meetings/infrastructure/meetings-scheduler.repository.js";
import { OutboxRepository } from "../src/outbox/infrastructure/outbox.repository.js";
import { OutboxWriterService } from "../src/outbox/outbox-writer.service.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * MTG-03 - verifies meeting transactions and policy-visible persistence with a
 * real isolated PostgreSQL schema. Each case creates its own rows so the suite
 * remains independent when Vitest runs files in parallel.
 */
describe("meeting persistence", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let repository: MeetingsRepository;
  let scheduler: MeetingsSchedulerRepository;
  let counter = 0;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: db.url },
        { schema: db.schema },
      ),
    });
    const outbox = new OutboxWriterService(
      prisma as never,
      new OutboxRepository(prisma as never),
    );
    repository = new MeetingsRepository(prisma as never, outbox);
    scheduler = new MeetingsSchedulerRepository(prisma as never);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  async function user(): Promise<string> {
    counter += 1;
    return (
      await prisma.user.create({
        data: { email: `meeting-${counter}@example.test` },
      })
    ).id;
  }

  async function create(
    input: { participantIds?: string[]; reminderAt?: Date } = {},
  ) {
    const organizerId = await user();
    return repository.create({
      title: `Planning ${++counter}`,
      type: "ONLINE",
      organizerId,
      startAt: new Date("2030-01-01T10:00:00.000Z"),
      endAt: new Date("2030-01-01T11:00:00.000Z"),
      onlineLink: "https://meet.example.test/room",
      participantIds: input.participantIds ?? [],
      ...(input.reminderAt ? { reminderAt: input.reminderAt } : {}),
      correlationId: `test-${counter}`,
    });
  }

  it("commits a meeting, participant/calendar projections, and invitation outbox deliveries together", async () => {
    const participants = [await user(), await user()];
    const meeting = await create({ participantIds: participants });
    expect(
      meeting.participants.map((participant) => participant.id).sort(),
    ).toEqual([...participants].sort());

    const [projections, events] = await Promise.all([
      prisma.calendarEntry.findMany({
        where: { meetingId: meeting.id },
        orderBy: { userId: "asc" },
      }),
      prisma.outboxEvent.findMany({
        where: { resourceId: meeting.id },
        include: { deliveries: true },
      }),
    ]);
    expect(projections).toHaveLength(3);
    expect(
      projections.every((entry) => entry.type === CalendarEntryType.MEETING),
    ).toBe(true);
    expect(events).toHaveLength(2);
    expect(
      events.every(
        (event) =>
          event.name === "meeting.participant.invited" &&
          event.deliveries[0]?.status === OutboxDeliveryStatus.PENDING,
      ),
    ).toBe(true);
  });

  it("rolls back the meeting when a dependent participant write fails", async () => {
    const organizerId = await user();
    const before = await prisma.meeting.count();
    await expect(
      repository.create({
        title: "Rollback marker",
        type: "ONLINE",
        organizerId,
        startAt: new Date("2030-02-01T10:00:00.000Z"),
        endAt: new Date("2030-02-01T11:00:00.000Z"),
        onlineLink: "https://meet.example.test/rollback",
        participantIds: [MISSING_UUID],
        correlationId: "rollback",
      }),
    ).rejects.toThrow();
    expect(await prisma.meeting.count()).toBe(before);
    expect(
      await prisma.calendarEntry.count({ where: { title: "Rollback marker" } }),
    ).toBe(0);
  });

  it("updates all calendar projections without changing modality-only fields", async () => {
    const meeting = await create({ participantIds: [await user()] });
    const startAt = new Date("2030-01-02T10:00:00.000Z");
    const endAt = new Date("2030-01-02T11:00:00.000Z");
    const updated = await repository.update(meeting.id, meeting.organizer.id, {
      title: "Rescheduled",
      startAt,
      endAt,
    });
    if (typeof updated === "string") throw new Error(updated);
    expect(updated.title).toBe("Rescheduled");
    const projections = await prisma.calendarEntry.findMany({
      where: { meetingId: meeting.id },
    });
    expect(projections).toHaveLength(2);
    expect(
      projections.every(
        (entry) =>
          entry.title === "Rescheduled" &&
          entry.startAt.getTime() === startAt.getTime(),
      ),
    ).toBe(true);
  });

  it("persists final responses once, handles participant projections, and removes cancelled projections", async () => {
    const invitee = await user();
    const added = await user();
    const meeting = await create({ participantIds: [invitee] });
    expect(
      await repository.respond(meeting.id, invitee, "ACCEPTED"),
    ).toMatchObject({ response: MeetingParticipantResponse.ACCEPTED });
    expect(await repository.respond(meeting.id, invitee, "DECLINED")).toBe(
      "already_acknowledged",
    );
    expect(
      await repository.addParticipant(
        meeting.id,
        meeting.organizer.id,
        added,
        "add",
      ),
    ).not.toBe("not_found");
    expect(
      await prisma.calendarEntry.count({
        where: { meetingId: meeting.id, userId: added },
      }),
    ).toBe(1);
    expect(
      await repository.removeParticipant(
        meeting.id,
        meeting.organizer.id,
        added,
      ),
    ).not.toBe("not_invited");
    expect(
      await prisma.calendarEntry.count({
        where: { meetingId: meeting.id, userId: added },
      }),
    ).toBe(0);
    const cancelled = await repository.transition(
      meeting.id,
      meeting.organizer.id,
      "CANCELLED",
    );
    if (typeof cancelled === "string") throw new Error(cancelled);
    expect(cancelled.status).toBe(MeetingStatus.CANCELLED);
    expect(
      await prisma.calendarEntry.count({ where: { meetingId: meeting.id } }),
    ).toBe(0);
    expect(await repository.respond(meeting.id, invitee, "ACCEPTED")).toBe(
      "not_scheduled",
    );
  });

  it("counts only overlapping scheduled meetings and excludes declined invitees", async () => {
    const participant = await user();
    const first = await create({ participantIds: [participant] });
    const second = await create({ participantIds: [participant] });
    await repository.respond(second.id, participant, "DECLINED");
    const counts = await repository.availability(
      [participant],
      new Date("2030-01-01T10:30:00.000Z"),
      new Date("2030-01-01T10:45:00.000Z"),
    );
    expect(counts.get(participant)).toBe(1);
    expect(
      (
        await repository.availability(
          [participant],
          new Date("2030-01-01T10:30:00.000Z"),
          new Date("2030-01-01T10:45:00.000Z"),
          first.id,
        )
      ).get(participant),
    ).toBe(0);
  });

  it("claims each due reminder occurrence exactly once and excludes terminal meetings", async () => {
    const dueAt = new Date("2029-12-31T09:00:00.000Z");
    const meeting = await create({ reminderAt: dueAt });
    const candidates = await scheduler.findReminderCandidates(
      new Date("2030-03-01T10:00:00.000Z"),
    );
    const candidate = candidates.find((item) => item.id === meeting.id);
    expect(candidate).toBeDefined();
    expect(
      await prisma.$transaction((tx) =>
        scheduler.tryClaim(tx as never, candidate!),
      ),
    ).toBe(true);
    expect(
      await prisma.$transaction((tx) =>
        scheduler.tryClaim(tx as never, candidate!),
      ),
    ).toBe(false);
    await repository.transition(meeting.id, meeting.organizer.id, "COMPLETED");
    expect(
      (
        await scheduler.findReminderCandidates(
          new Date("2030-03-01T10:00:00.000Z"),
        )
      ).map((item) => item.id),
    ).not.toContain(meeting.id);
  });
});
