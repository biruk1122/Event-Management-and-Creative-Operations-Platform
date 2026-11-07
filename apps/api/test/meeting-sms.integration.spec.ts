import { randomUUID } from "node:crypto";
/* eslint-disable @typescript-eslint/require-await -- provider test doubles return promises without awaiting anything */
import { PrismaPg } from "@prisma/adapter-pg";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  MeetingParticipantResponse,
  MeetingType,
  PrismaClient,
} from "../src/generated/prisma/client.js";
import { seedRbac } from "../src/rbac/seed-rbac.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";
import type { MeetingsRepository } from "../src/meetings/infrastructure/meetings.repository.js";
import type { MeetingsSmsService } from "../src/meetings/meetings-sms.service.js";
import type { SmsService } from "../src/sms/sms.service.js";
import { formatSmsDateTime } from "../src/sms/sms-format.js";

const MINUTE = 60_000;

function rand(): string {
  return Math.random().toString(36).slice(2);
}

describe("meeting SMS (Phase 3)", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let repository: MeetingsRepository;
  let meetingSms: MeetingsSmsService;
  let smsService: SmsService;
  let organizer: { id: string };
  let phoneCounter = 0;

  const provider = { send: vi.fn(), getStatus: vi.fn(), getBalance: vi.fn() };

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.NODE_ENV = "test";
    process.env.AUTH_ACCESS_TOKEN_SECRET ??=
      "meeting-sms-access-token-secret-at-least-32";
    process.env.AUTH_REFRESH_TOKEN_SECRET ??=
      "meeting-sms-refresh-token-secret-at-least-32";
    process.env.AFROMESSAGE_ENABLED = "true";
    process.env.AFROMESSAGE_API_KEY = "meeting-sms-api-key-value";
    process.env.AFROMESSAGE_SENDER_ID = "LELA";
    process.env.AFROMESSAGE_CALLBACK_TOKEN =
      "meeting-sms-callback-token-0123456789abcdef";
    process.env.MEETING_REMINDER_MINUTES = "30";

    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: db.url },
        { schema: db.schema },
      ),
    });
    await seedRbac(prisma);

    const [
      { Test },
      appModule,
      smsTypes,
      meetingsRepoModule,
      meetingsSmsModule,
      smsServiceModule,
    ] = await Promise.all([
      import("@nestjs/testing"),
      import("../src/app.module.js"),
      import("../src/sms/sms.types.js"),
      import("../src/meetings/infrastructure/meetings.repository.js"),
      import("../src/meetings/meetings-sms.service.js"),
      import("../src/sms/sms.service.js"),
    ]);

    const moduleRef = await Test.createTestingModule({
      imports: [appModule.AppModule],
    })
      .overrideProvider(smsTypes.SMS_PROVIDER)
      .useValue(provider)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();

    provider.send.mockImplementation(async () => ({
      kind: "ACCEPTED",
      providerMessageId: `provider-${rand()}`,
      httpStatus: 200,
      response: { acknowledge: "success", status: "Send in progress..." },
    }));

    repository = app.get(meetingsRepoModule.MeetingsRepository);
    meetingSms = app.get(meetingsSmsModule.MeetingsSmsService);
    smsService = app.get(smsServiceModule.SmsService);
    organizer = await person(null, "Organizer");
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await db?.drop();
  });

  /** Ethiopian mobile numbers in the 09 format; each call returns a new one. */
  function nextPhone(): string {
    phoneCounter += 1;
    return `0910${String(100000 + phoneCounter).padStart(6, "0")}`;
  }

  async function person(phone: string | null, name: string) {
    return prisma.user.create({
      data: {
        email: `${name.toLowerCase()}-${rand()}@meeting-sms.test`,
        phone,
        firstName: name,
        lastName: "Test",
      },
    });
  }

  /** Sends one queued message the way the relay would, without waiting for it. */
  async function dispatchMessage(smsMessageId: string): Promise<void> {
    await smsService.dispatch({
      payload: { smsMessageId },
    } as unknown as Parameters<SmsService["dispatch"]>[0]);
  }

  function minutesFromNow(minutes: number): Date {
    return new Date(Date.now() + minutes * MINUTE);
  }

  async function createMeeting(options: {
    startAt?: Date;
    participantIds: string[];
    location?: string;
  }) {
    const startAt = options.startAt ?? minutesFromNow(180);
    return repository.create({
      title: `Sync ${rand()}`,
      type: MeetingType.PHYSICAL,
      organizerId: organizer.id,
      startAt,
      endAt: new Date(startAt.getTime() + 60 * MINUTE),
      // Physical meetings need a venue (meetings_type_details constraint).
      location: options.location ?? "Main Hall",
      participantIds: options.participantIds,
      correlationId: randomUUID(),
    });
  }

  async function smsRows(where: Record<string, unknown>) {
    return prisma.smsMessage.findMany({
      where: where as never,
      orderBy: { createdAt: "asc" },
    });
  }

  /** A pending row written directly, so the relay does not send it first. */
  async function queuePending(input: {
    category:
      | "MEETING_INVITATION"
      | "MEETING_CHANGED"
      | "MEETING_REMINDER"
      | "MEETING_CANCELLED";
    recipientUserId: string;
    meetingId: string;
    startAt: Date;
  }) {
    return prisma.smsMessage.create({
      data: {
        idempotencyKey: `test.${input.category}:${randomUUID()}`,
        category: input.category,
        recipientUserId: input.recipientUserId,
        recipientPhone: "+251910100099",
        body: "LELA: test",
        templateKey: "test",
        sourceType: "meeting",
        sourceId: input.meetingId,
        sourceDueAt: input.startAt,
        status: "PENDING",
      },
    });
  }

  it("queues one invitation per invited participant in the creating transaction", async () => {
    const valid = await person(nextPhone(), "Hanna");
    const invalid = await person("123", "Mulu");
    const meeting = await createMeeting({
      participantIds: [valid.id, invalid.id],
      location: "Room 4",
    });
    const rows = await smsRows({
      sourceId: meeting.id,
      category: "MEETING_INVITATION",
    });
    expect(rows.map((row) => row.recipientUserId).sort()).toEqual(
      [valid.id, invalid.id].sort(),
    );
    const skipped = rows.find((row) => row.recipientUserId === invalid.id);
    expect(skipped).toMatchObject({
      status: "SKIPPED",
      skipReason: "INVALID_PHONE_NUMBER",
    });
    const queued = rows.find((row) => row.recipientUserId === valid.id);
    expect(queued?.body).toContain("Room 4");
    expect(queued?.body).toContain(meeting.title);
    expect(rows.some((row) => row.recipientUserId === organizer.id)).toBe(
      false,
    );
  });

  it("invites a participant added later, and does not repeat the invitation when they are re-added", async () => {
    const latecomer = await person(nextPhone(), "Samuel");
    const meeting = await createMeeting({ participantIds: [] });
    await repository.addParticipant(
      meeting.id,
      organizer.id,
      latecomer.id,
      randomUUID(),
    );
    await repository.removeParticipant(meeting.id, organizer.id, latecomer.id);
    await repository.addParticipant(
      meeting.id,
      organizer.id,
      latecomer.id,
      randomUUID(),
    );
    expect(
      await smsRows({ sourceId: meeting.id, category: "MEETING_INVITATION" }),
    ).toHaveLength(1);
  });

  it("notifies current participants about a time or location change, but not about a title change", async () => {
    const first = await person(nextPhone(), "Eyob");
    const second = await person(nextPhone(), "Ruth");
    const meeting = await createMeeting({
      participantIds: [first.id, second.id],
      location: "Hall A",
    });

    await repository.update(
      meeting.id,
      organizer.id,
      { title: "Renamed only" },
      randomUUID(),
    );
    expect(
      await smsRows({ sourceId: meeting.id, category: "MEETING_CHANGED" }),
    ).toHaveLength(0);

    const newStart = minutesFromNow(240);
    await repository.update(
      meeting.id,
      organizer.id,
      {
        startAt: newStart,
        endAt: new Date(newStart.getTime() + 60 * MINUTE),
      },
      randomUUID(),
    );
    const afterTime = await smsRows({
      sourceId: meeting.id,
      category: "MEETING_CHANGED",
    });
    expect(afterTime.map((row) => row.recipientUserId).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    // The notice carries both the new start and the new end time.
    const newEnd = new Date(newStart.getTime() + 60 * MINUTE);
    expect(afterTime[0]?.body).toContain(
      `New time: ${formatSmsDateTime(newStart)} to ${formatSmsDateTime(newEnd)}`,
    );

    await repository.update(
      meeting.id,
      organizer.id,
      { location: "Hall B" },
      randomUUID(),
    );
    const afterLocation = await smsRows({
      sourceId: meeting.id,
      category: "MEETING_CHANGED",
    });
    expect(afterLocation).toHaveLength(4);
    expect(afterLocation.at(-1)?.body).toContain("Hall B");
  });

  it("sends a reminder once, to participants added before the lead time, and not to decliners", async () => {
    const early = await person(nextPhone(), "Kidus");
    const late = await person(nextPhone(), "Liya");
    const declined = await person(nextPhone(), "Dawit");
    const meeting = await createMeeting({
      startAt: minutesFromNow(20),
      participantIds: [early.id, late.id, declined.id],
    });
    await prisma.meetingParticipant.updateMany({
      where: { meetingId: meeting.id, userId: { in: [early.id, declined.id] } },
      data: { createdAt: minutesFromNow(-120) },
    });
    await prisma.meetingParticipant.update({
      where: {
        meetingId_userId: { meetingId: meeting.id, userId: declined.id },
      },
      data: {
        response: MeetingParticipantResponse.DECLINED,
        respondedAt: new Date(),
      },
    });

    await meetingSms.scan(new Date());
    await meetingSms.scan(new Date());

    const reminders = await smsRows({
      sourceId: meeting.id,
      category: "MEETING_REMINDER",
    });
    expect(reminders.map((row) => row.recipientUserId)).toEqual([early.id]);
  });

  it("queues no reminder for a cancelled meeting, and cancels a reminder already queued for it", async () => {
    const member = await person(nextPhone(), "Tigist");
    const meeting = await createMeeting({
      startAt: minutesFromNow(15),
      participantIds: [member.id],
    });
    await prisma.meetingParticipant.update({
      where: {
        meetingId_userId: { meetingId: meeting.id, userId: member.id },
      },
      data: { createdAt: minutesFromNow(-120) },
    });
    await repository.transition(
      meeting.id,
      organizer.id,
      "CANCELLED",
      randomUUID(),
    );

    await meetingSms.scan(new Date());
    expect(
      await smsRows({ sourceId: meeting.id, category: "MEETING_REMINDER" }),
    ).toHaveLength(0);

    const row = await queuePending({
      category: "MEETING_REMINDER",
      recipientUserId: member.id,
      meetingId: meeting.id,
      startAt: meeting.startAt,
    });
    await dispatchMessage(row.id);
    const after = await prisma.smsMessage.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(after.status).toBe("CANCELLED");
    expect(after.lastError).toBe("MEETING_NOT_SCHEDULED");
  });

  it("does not send a queued message to someone removed from the meeting", async () => {
    const leaver = await person(nextPhone(), "Yonas");
    const meeting = await createMeeting({
      startAt: minutesFromNow(240),
      participantIds: [leaver.id],
    });
    const row = await queuePending({
      category: "MEETING_CHANGED",
      recipientUserId: leaver.id,
      meetingId: meeting.id,
      startAt: meeting.startAt,
    });
    await repository.removeParticipant(meeting.id, organizer.id, leaver.id);
    await dispatchMessage(row.id);
    const after = await prisma.smsMessage.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(after.status).toBe("CANCELLED");
    expect(after.lastError).toBe("PARTICIPANT_REMOVED");
  });

  it("does not send an invitation written for a start time that has since changed", async () => {
    const member = await person(nextPhone(), "Sara");
    const meeting = await createMeeting({
      startAt: minutesFromNow(240),
      participantIds: [member.id],
    });
    const row = await queuePending({
      category: "MEETING_INVITATION",
      recipientUserId: member.id,
      meetingId: meeting.id,
      startAt: meeting.startAt,
    });
    const newStart = minutesFromNow(300);
    await repository.update(
      meeting.id,
      organizer.id,
      { startAt: newStart, endAt: new Date(newStart.getTime() + 60 * MINUTE) },
      randomUUID(),
    );
    await dispatchMessage(row.id);
    const after = await prisma.smsMessage.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(after.status).toBe("CANCELLED");
    expect(after.lastError).toBe("START_CHANGED");
  });

  it("keeps the meeting when its invitation cannot be queued, and records the failure without the phone number", async () => {
    const member = await person(nextPhone(), "Hiwot");
    const spy = vi
      .spyOn(smsService, "enqueue")
      .mockRejectedValueOnce(new Error("simulated enqueue failure"));
    const meeting = await createMeeting({ participantIds: [member.id] });
    spy.mockRestore();

    expect(
      await prisma.meeting.findUnique({ where: { id: meeting.id } }),
    ).not.toBeNull();
    const failures = await prisma.auditRecord.findMany({
      where: { action: "sms.enqueue_failed", resourceId: meeting.id },
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]!.metadata).toMatchObject({
      category: "MEETING_INVITATION",
    });
    expect(JSON.stringify(failures[0]!.metadata)).not.toMatch(/\+251|0910/);
  });

  it("queues one cancellation notice per current participant, with the scheduled start time", async () => {
    const first = await person(nextPhone(), "Hermela");
    const second = await person(nextPhone(), "Bereket");
    const start = minutesFromNow(300);
    const meeting = await createMeeting({
      startAt: start,
      participantIds: [first.id, second.id],
    });
    const result = await repository.transition(
      meeting.id,
      organizer.id,
      "CANCELLED",
      randomUUID(),
    );
    expect(result).toMatchObject({ status: "CANCELLED" });
    const rows = await smsRows({
      sourceId: meeting.id,
      category: "MEETING_CANCELLED",
    });
    expect(rows.map((row) => row.recipientUserId).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    expect(rows[0]?.body).toContain(
      `scheduled for ${formatSmsDateTime(start)} has been cancelled`,
    );
    expect(rows.some((row) => row.recipientUserId === organizer.id)).toBe(
      false,
    );
  });

  it("queues each cancellation notice once, and refuses a second cancellation", async () => {
    const member = await person(nextPhone(), "Selam");
    const meeting = await createMeeting({ participantIds: [member.id] });
    await repository.transition(
      meeting.id,
      organizer.id,
      "CANCELLED",
      randomUUID(),
    );
    expect(
      await repository.transition(
        meeting.id,
        organizer.id,
        "CANCELLED",
        randomUUID(),
      ),
    ).toBe("invalid_transition");
    expect(
      await smsRows({ sourceId: meeting.id, category: "MEETING_CANCELLED" }),
    ).toHaveLength(1);
  });

  it("cancels the meeting even when its cancellation notice cannot be queued, and records the failure", async () => {
    const member = await person(nextPhone(), "Nahom");
    const meeting = await createMeeting({ participantIds: [member.id] });
    const spy = vi
      .spyOn(smsService, "enqueue")
      .mockRejectedValueOnce(new Error("simulated cancellation failure"));
    const result = await repository.transition(
      meeting.id,
      organizer.id,
      "CANCELLED",
      randomUUID(),
    );
    spy.mockRestore();

    expect(result).toMatchObject({ status: "CANCELLED" });
    const stored = await prisma.meeting.findUniqueOrThrow({
      where: { id: meeting.id },
    });
    expect(stored.status).toBe("CANCELLED");
    const failures = await prisma.auditRecord.findMany({
      where: { action: "sms.enqueue_failed", resourceId: meeting.id },
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]!.metadata).toMatchObject({
      category: "MEETING_CANCELLED",
    });
  });

  it("sends no cancellation notice to someone removed before the cancellation", async () => {
    const kept = await person(nextPhone(), "Girma");
    const leaver = await person(nextPhone(), "Meron");
    const meeting = await createMeeting({
      participantIds: [kept.id, leaver.id],
    });
    await repository.removeParticipant(meeting.id, organizer.id, leaver.id);
    await repository.transition(
      meeting.id,
      organizer.id,
      "CANCELLED",
      randomUUID(),
    );
    const rows = await smsRows({
      sourceId: meeting.id,
      category: "MEETING_CANCELLED",
    });
    expect(rows.map((row) => row.recipientUserId)).toEqual([kept.id]);
  });

  it("sends a queued cancellation notice to a current participant, and cancels it for anyone else", async () => {
    const member = await person(nextPhone(), "Tewodros");
    const outsider = await person(nextPhone(), "Sosina");
    const meeting = await createMeeting({
      startAt: minutesFromNow(300),
      participantIds: [member.id],
    });
    await repository.transition(
      meeting.id,
      organizer.id,
      "CANCELLED",
      randomUUID(),
    );
    const forParticipant = await queuePending({
      category: "MEETING_CANCELLED",
      recipientUserId: member.id,
      meetingId: meeting.id,
      startAt: meeting.startAt,
    });
    const forOutsider = await queuePending({
      category: "MEETING_CANCELLED",
      recipientUserId: outsider.id,
      meetingId: meeting.id,
      startAt: meeting.startAt,
    });
    await dispatchMessage(forParticipant.id);
    await dispatchMessage(forOutsider.id);

    const sent = await prisma.smsMessage.findUniqueOrThrow({
      where: { id: forParticipant.id },
    });
    expect(sent.status).toBe("ACCEPTED");
    const refused = await prisma.smsMessage.findUniqueOrThrow({
      where: { id: forOutsider.id },
    });
    expect(refused.status).toBe("CANCELLED");
    expect(refused.lastError).toBe("PARTICIPANT_REMOVED");
  });

  it("writes meeting times in Africa/Addis_Ababa time", async () => {
    const member = await person(nextPhone(), "Abebe");
    // 08:00 UTC is 11:00 in Addis Ababa (UTC+3, no daylight saving).
    const startAt = new Date("2026-11-20T08:00:00Z");
    const meeting = await createMeeting({
      startAt,
      participantIds: [member.id],
    });
    const [invitation] = await smsRows({
      sourceId: meeting.id,
      category: "MEETING_INVITATION",
    });
    expect(invitation?.body).toMatch(/11:00/);
    expect(invitation?.body).not.toMatch(/08:00/);
  });
});
