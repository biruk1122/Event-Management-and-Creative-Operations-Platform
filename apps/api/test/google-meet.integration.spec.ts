import "reflect-metadata";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { DatabaseService } from "../src/database/database.service.js";
import { validateEnvironment } from "../src/config/environment.js";
import { PermissionsService } from "../src/common/security/permissions.service.js";
import { GoogleMeetConfig } from "../src/meetings/google-meet/google-meet.config.js";
import type { GoogleCalendarAdapter } from "../src/meetings/google-meet/google-calendar.adapter.js";
import { GoogleMeetRepository } from "../src/meetings/google-meet/google-meet.repository.js";
import { GoogleMeetService } from "../src/meetings/google-meet/google-meet.service.js";
import { queueGoogleMeetChange } from "../src/meetings/google-meet/google-meet-queue.js";
import { MeetingsRepository } from "../src/meetings/infrastructure/meetings.repository.js";
import { GoogleMeetController } from "../src/meetings/google-meet/google-meet.controller.js";
import { AccessTokenGuard } from "../src/auth/guards/access-token.guard.js";
import { CsrfGuard } from "../src/auth/guards/csrf.guard.js";
import { MeetError } from "../src/meetings/google-meet/google-meet.errors.js";
import { seedRbac } from "../src/rbac/seed-rbac.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const join = "https://meet.google.com/abc-defg-hij";
const fallback = "https://video.example.test/manual";
const conference = () => ({
  id: "mapped",
  conferenceData: {
    createRequest: { status: { statusCode: "success" } },
    entryPoints: [{ entryPointType: "video", uri: join }],
  },
});

describe("optional Google Meet lifecycle and durable boundaries", () => {
  let isolated: IsolatedDatabase;
  let db: DatabaseService;
  let repository: GoogleMeetRepository;
  let config: GoogleMeetConfig;
  let service: GoogleMeetService;
  const google = {
    refresh: vi.fn<GoogleCalendarAdapter["refresh"]>(),
    event: vi.fn<GoogleCalendarAdapter["event"]>(),
    revoke: vi.fn<GoogleCalendarAdapter["revoke"]>(),
    exchange: vi.fn<GoogleCalendarAdapter["exchange"]>(),
    authorizationUrl: vi.fn<GoogleCalendarAdapter["authorizationUrl"]>(),
  };
  let owner: string;
  let other: string;
  let member: string;
  let meetingId: string;
  let sequence = 0;
  beforeAll(async () => {
    isolated = await createIsolatedDatabase();
    const env = validateEnvironment({
      DATABASE_URL: isolated.url,
      NODE_ENV: "test",
      AUTH_ACCESS_TOKEN_SECRET: "test-access-secret-longer-than-32-characters",
      AUTH_REFRESH_TOKEN_SECRET:
        "test-refresh-secret-longer-than-32-characters",
      GOOGLE_MEET_ENABLED: "true",
      GOOGLE_MEET_OPERATOR: "Fixture operator",
      GOOGLE_MEET_ACTIVATION_REVIEW: "fixture-only-no-live-calls",
      GOOGLE_MEET_CLIENT_ID: "fixture-client",
      GOOGLE_MEET_CLIENT_SECRET: "fixture-secret",
      GOOGLE_MEET_CALLBACK_URL:
        "http://localhost:4000/api/v1/meetings/google-calendar/callback",
      GOOGLE_MEET_RETURN_URL: "http://localhost:3000/meetings",
      GOOGLE_MEET_KEY_ID: "test",
      GOOGLE_MEET_KEYS: JSON.stringify({
        test: randomBytes(32).toString("base64"),
      }),
    });
    db = new DatabaseService(env);
    await seedRbac(db);
    config = new GoogleMeetConfig(env);
    repository = new GoogleMeetRepository(db);
    service = new GoogleMeetService(
      repository,
      new PermissionsService(db),
      config,
      google as unknown as GoogleCalendarAdapter,
    );
  });
  beforeEach(async () => {
    vi.resetAllMocks();
    await db.googleMeetExport.updateMany({ data: { nextAttemptAt: null } });
    const admin = await db.role.findUniqueOrThrow({
      where: { name: "Super Admin" },
    });
    const user = async () =>
      db.user.create({
        data: {
          email: `meet-${++sequence}@test.local`,
          roleAssignment: { create: { roleId: admin.id } },
        },
      });
    owner = (await user()).id;
    other = (await user()).id;
    member = (
      await db.user.create({
        data: { email: `no-grant-${++sequence}@test.local` },
      })
    ).id;
    meetingId = (
      await db.meeting.create({
        data: {
          organizerId: owner,
          title: "Private title must never be exported",
          type: "ONLINE",
          startAt: new Date("2030-01-01T10:00:00Z"),
          endAt: new Date("2030-01-01T11:00:00Z"),
          onlineLink: fallback,
        },
      })
    ).id;
    await db.googleCalendarConnection.create({
      data: {
        userId: owner,
        subject: "provider-subject",
        status: "CONNECTED",
        token: config.cipher!.seal("refresh-token", `refresh:${owner}`),
      },
    });
    google.refresh.mockResolvedValue({
      access_token: "memory-only-token",
      token_type: "Bearer",
    });
    google.event.mockImplementation((_user, _token, _id, method) =>
      Promise.resolve(
        method === "GET" ? {} : method === "DELETE" ? {} : conference(),
      ),
    );
    google.revoke.mockResolvedValue(undefined);
  });
  afterAll(async () => {
    await db?.$disconnect();
    await isolated?.drop();
  });

  it("applies migrations, publishes only minimal private data and preserves refresh tokens omitted on refresh", async () => {
    const prior = await db.googleCalendarConnection.findUniqueOrThrow({
      where: { userId: owner },
    });
    await service.synchronize(owner, meetingId);
    expect(
      (await db.meeting.findUniqueOrThrow({ where: { id: meetingId } }))
        .onlineLink,
    ).toBe(join);
    const mapping = await db.googleMeetExport.findUniqueOrThrow({
      where: { meetingId },
    });
    expect(mapping.status).toBe("READY");
    expect(
      google.event.mock.calls.find((call) => call[3] === "POST")?.[4],
    ).toEqual({
      id: mapping.eventId,
      summary: "Lela meeting",
      visibility: "private",
      start: { dateTime: "2030-01-01T10:00:00.000Z" },
      end: { dateTime: "2030-01-01T11:00:00.000Z" },
      reminders: { useDefault: false },
      conferenceData: {
        createRequest: {
          requestId: mapping.requestId,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    });
    expect(
      (
        await db.googleCalendarConnection.findUniqueOrThrow({
          where: { userId: owner },
        })
      ).token,
    ).toBe(prior.token);
    expect(
      JSON.stringify(await service.status(owner, meetingId)),
    ).not.toContain("refresh-token");
  });
  it("denies another Super Admin and a member without borrowing the organizer's grant", async () => {
    await expect(service.synchronize(other, meetingId)).rejects.toMatchObject({
      status: 403,
    });
    await expect(service.status(other, meetingId)).rejects.toMatchObject({
      status: 403,
    });
    await expect(service.synchronize(member, meetingId)).rejects.toMatchObject({
      status: 403,
    });
    expect(google.refresh).not.toHaveBeenCalled();
  });
  it("serializes across repository instances and enforces durable atomic quota caps", async () => {
    const otherRepository = new GoogleMeetRepository(db);
    const lease = await repository.lock(owner);
    await expect(otherRepository.lock(owner)).rejects.toMatchObject({
      reason: "BUSY",
    });
    await repository.unlock(owner, lease);
    await db.googleCalendarBudget.deleteMany();
    const result = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        otherRepository.reserve(owner, [100, 100, 2, 100]),
      ),
    );
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(
      (await db.googleCalendarBudget.findMany()).every((row) => row.used === 2),
    ).toBe(true);
  });
  it("consumes OAuth state only for its owner/session, expires and prevents callback replay", async () => {
    await service.disconnect(owner);
    google.authorizationUrl.mockImplementation(
      (state) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
    );
    const session = await db.authSession.create({
      data: {
        userId: owner,
        familyId: randomUUID(),
        refreshTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    const url = new URL(await service.authorize(owner, session.id));
    const state = url.searchParams.get("state")!;
    const pending = await db.googleCalendarConsent.findUniqueOrThrow({
      where: { userId: owner },
    });
    expect(pending.stateHash).toBe(
      createHash("sha256").update(state).digest("hex"),
    );
    expect(pending.verifier).not.toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(
      service.callback(owner, randomUUID(), state, "code"),
    ).rejects.toMatchObject({ reason: "CONSENT_INVALID" });
    await expect(
      service.callback(other, session.id, state, "code"),
    ).rejects.toMatchObject({ reason: "CONSENT_INVALID" });
    google.exchange.mockResolvedValue({
      subject: "provider-subject",
      refreshToken: "new-refresh",
    });
    await service.callback(owner, session.id, state, "code");
    await expect(
      service.callback(owner, session.id, state, "code"),
    ).rejects.toMatchObject({ reason: "CONSENT_INVALID" });
    expect(google.exchange).toHaveBeenCalledTimes(1);
    const connection = await db.googleCalendarConnection.findUniqueOrThrow({
      where: { userId: owner },
    });
    expect(config.cipher!.open(connection.token!, `refresh:${owner}`)).toBe(
      "new-refresh",
    );
    expect(Reflect.getMetadata("__guards__", GoogleMeetController)).toEqual([
      AccessTokenGuard,
    ]);
    expect(
      Reflect.getMetadata(
        "__guards__",
        Reflect.get(GoogleMeetController.prototype, "authorize") as object,
      ),
    ).toEqual([CsrfGuard]);
    expect(
      Reflect.getMetadata(
        "__guards__",
        Reflect.get(GoogleMeetController.prototype, "callback") as object,
      ),
    ).toBeUndefined();
  });
  it("refreshes rotated tokens atomically and erases revoked tokens without losing manual links", async () => {
    google.refresh.mockResolvedValueOnce({
      access_token: "access",
      refresh_token: "rotated",
      token_type: "Bearer",
    });
    await service.synchronize(owner, meetingId);
    let connection = await db.googleCalendarConnection.findUniqueOrThrow({
      where: { userId: owner },
    });
    expect(config.cipher!.open(connection.token!, `refresh:${owner}`)).toBe(
      "rotated",
    );
    await db.googleMeetExport.update({
      where: { meetingId },
      data: { attemptedAt: null },
    });
    google.refresh.mockRejectedValueOnce(new MeetError("RECONNECT_REQUIRED"));
    await expect(service.synchronize(owner, meetingId)).rejects.toMatchObject({
      reason: "RECONNECT_REQUIRED",
    });
    connection = await db.googleCalendarConnection.findUniqueOrThrow({
      where: { userId: owner },
    });
    expect(connection.token).toBeNull();
    expect(connection.status).toBe("RECONNECT_REQUIRED");
    expect(
      (await db.meeting.findUniqueOrThrow({ where: { id: meetingId } }))
        .onlineLink,
    ).toBe(join);
  });
  it("reconciles a duplicate POST with the same durable provider identifiers", async () => {
    google.event
      .mockReset()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ duplicate: true })
      .mockResolvedValueOnce(conference());
    await service.synchronize(owner, meetingId);
    const ids = google.event.mock.calls.map((call) => call[2]);
    expect(new Set(ids).size).toBe(1);
    expect(
      (await db.googleMeetExport.findUniqueOrThrow({ where: { meetingId } }))
        .status,
    ).toBe("READY");
  });
  it("never overwrites a newer manual link and reconciles cleanup after the stale response", async () => {
    google.event.mockImplementation(async (_user, _token, _id, method) => {
      if (method === "GET") return {};
      if (method === "POST")
        await db.meeting.update({
          where: { id: meetingId },
          data: { onlineLink: "https://video.example.test/newer" },
        });
      return conference();
    });
    await expect(service.synchronize(owner, meetingId)).rejects.toMatchObject({
      reason: "STALE",
    });
    expect(
      (await db.meeting.findUniqueOrThrow({ where: { id: meetingId } }))
        .onlineLink,
    ).toBe("https://video.example.test/newer");
    await db.googleMeetExport.update({
      where: { meetingId },
      data: { attemptedAt: null },
    });
    await service.synchronize(owner, meetingId);
    expect(
      (await db.googleMeetExport.findUniqueOrThrow({ where: { meetingId } }))
        .status,
    ).toBe("DETACHED");
    expect(google.event.mock.calls.at(-1)?.[3]).toBe("DELETE");
  });
  it("persists bounded pending work after timeout without issuing a new event ID", async () => {
    google.event.mockRejectedValueOnce(new MeetError("PROVIDER_UNAVAILABLE"));
    await expect(service.synchronize(owner, meetingId)).rejects.toMatchObject({
      reason: "PROVIDER_UNAVAILABLE",
    });
    const mapping = await db.googleMeetExport.findUniqueOrThrow({
      where: { meetingId },
    });
    expect(mapping.status).toBe("PENDING");
    expect(mapping.attempts).toBe(1);
    expect(mapping.nextAttemptAt?.getTime()).toBeGreaterThan(Date.now());
    expect(
      (await db.meeting.findUniqueOrThrow({ where: { id: meetingId } }))
        .onlineLink,
    ).toBe(fallback);
    await db.googleMeetExport.update({
      where: { meetingId },
      data: { nextAttemptAt: new Date(0) },
    });
    await service.synchronize(owner, meetingId, false, true);
    expect(
      (await db.googleMeetExport.findUniqueOrThrow({ where: { meetingId } }))
        .eventId,
    ).toBe(mapping.eventId);
  });
  it("does not poison a new connection with an obsolete export and allows same-account cleanup", async () => {
    await service.synchronize(owner, meetingId);
    await db.googleCalendarConnection.update({
      where: { userId: owner },
      data: { generation: randomUUID(), subject: "different-account" },
    });
    await expect(service.synchronize(owner, meetingId)).rejects.toMatchObject({
      reason: "EXPORT_ACCOUNT_CHANGED",
    });
    expect(
      (
        await db.googleCalendarConnection.findUniqueOrThrow({
          where: { userId: owner },
        })
      ).token,
    ).not.toBeNull();
    await db.googleCalendarConnection.update({
      where: { userId: owner },
      data: { subject: "provider-subject" },
    });
    await db.googleMeetExport.update({
      where: { meetingId },
      data: { attemptedAt: null },
    });
    await service.synchronize(owner, meetingId, true);
    expect(
      (await db.googleMeetExport.findUniqueOrThrow({ where: { meetingId } }))
        .status,
    ).toBe("DETACHED");
  });
  it("keeps completed history out of the worker queue and marks cancellations for cleanup", async () => {
    await service.synchronize(owner, meetingId);
    await db.meeting.update({
      where: { id: meetingId },
      data: { status: "COMPLETED" },
    });
    await db.$transaction(async (tx) =>
      queueGoogleMeetChange(
        tx,
        await tx.meeting.findUniqueOrThrow({ where: { id: meetingId } }),
      ),
    );
    let mapping = await db.googleMeetExport.findUniqueOrThrow({
      where: { meetingId },
    });
    expect(mapping.status).toBe("READY");
    expect(mapping.nextAttemptAt).toBeNull();
    await db.meeting.update({
      where: { id: meetingId },
      data: { status: "CANCELLED" },
    });
    await db.$transaction(async (tx) =>
      queueGoogleMeetChange(
        tx,
        await tx.meeting.findUniqueOrThrow({ where: { id: meetingId } }),
      ),
    );
    mapping = await db.googleMeetExport.findUniqueOrThrow({
      where: { meetingId },
    });
    expect(mapping.status).toBe("CLEANUP_PENDING");
    expect(mapping.nextAttemptAt).not.toBeNull();
  });
  it("erases local credentials even if remote revocation fails and reports that uncertainty", async () => {
    google.revoke.mockImplementation(async () => {
      // This state must survive a process exit during the remote call.
      const erased = await db.googleCalendarConnection.findUniqueOrThrow({
        where: { userId: owner },
      });
      expect(erased.token).toBeNull();
      expect(erased.status).toBe("REVOCATION_FAILED");
      throw new MeetError("PROVIDER_UNAVAILABLE");
    });
    await expect(service.disconnect(owner)).resolves.toEqual({
      remoteRevoked: false,
    });
    const row = await db.googleCalendarConnection.findUniqueOrThrow({
      where: { userId: owner },
    });
    expect(row.token).toBeNull();
    expect(row.subject).toBeNull();
    expect(row.status).toBe("REVOCATION_FAILED");
    await expect(service.disconnect(owner)).resolves.toEqual({
      remoteRevoked: false,
    });
    expect(
      (
        await db.googleCalendarConnection.findUniqueOrThrow({
          where: { userId: owner },
        })
      ).status,
    ).toBe("REVOCATION_FAILED");
    expect(
      (await db.meeting.findUniqueOrThrow({ where: { id: meetingId } }))
        .onlineLink,
    ).toBe(fallback);
  });
  it("queues reschedules atomically with the local write and rolls both back together", async () => {
    await service.synchronize(owner, meetingId);
    const before = await db.meeting.findUniqueOrThrow({
      where: { id: meetingId },
    });
    await expect(
      db.$transaction(async (tx) => {
        const changed = await tx.meeting.update({
          where: { id: meetingId },
          data: { startAt: new Date("2030-01-01T10:15:00Z") },
        });
        await queueGoogleMeetChange(tx, changed);
        throw new Error("simulate local transaction failure");
      }),
    ).rejects.toThrow("simulate local transaction failure");
    expect(
      (await db.meeting.findUniqueOrThrow({ where: { id: meetingId } }))
        .startAt,
    ).toEqual(before.startAt);
    expect(
      (await db.googleMeetExport.findUniqueOrThrow({ where: { meetingId } }))
        .status,
    ).toBe("READY");
    google.event.mockClear();
    const core = new MeetingsRepository(db, {} as never);
    await core.update(meetingId, owner, {
      startAt: new Date("2030-01-01T10:15:00Z"),
    });
    expect(
      (await db.googleMeetExport.findUniqueOrThrow({ where: { meetingId } }))
        .status,
    ).toBe("PENDING");
    expect(google.event).not.toHaveBeenCalled();
    await core.transition(meetingId, owner, "CANCELLED");
    expect(
      (await db.googleMeetExport.findUniqueOrThrow({ where: { meetingId } }))
        .status,
    ).toBe("CLEANUP_PENDING");
  });
  it("recovers an abandoned in-flight operation after restart with its stable event ID", async () => {
    let reclaimedAt: Date | null = null;
    google.refresh.mockImplementationOnce(async () => {
      const inFlight = await db.googleMeetExport.findUniqueOrThrow({
        where: { meetingId },
      });
      reclaimedAt = inFlight.nextAttemptAt;
      throw new MeetError("PROVIDER_UNAVAILABLE");
    });
    await expect(service.synchronize(owner, meetingId)).rejects.toMatchObject({
      reason: "PROVIDER_UNAVAILABLE",
    });
    expect(reclaimedAt).not.toBeNull();
    expect(reclaimedAt!.getTime()).toBeGreaterThan(Date.now() + 120_000);
    const mapping = await db.googleMeetExport.update({
      where: { meetingId },
      data: { status: "PENDING", nextAttemptAt: new Date(0), failure: null },
    });
    await db.googleCalendarConnection.update({
      where: { userId: owner },
      data: { leaseId: randomUUID(), leaseUntil: new Date(0) },
    });
    google.event.mockResolvedValue(conference());
    const restarted = new GoogleMeetService(
      new GoogleMeetRepository(db),
      new PermissionsService(db),
      config,
      google as unknown as GoogleCalendarAdapter,
    );
    await restarted.reconcileDueExports();
    expect(
      (await db.googleMeetExport.findUniqueOrThrow({ where: { meetingId } }))
        .status,
    ).toBe("READY");
    expect(
      google.event.mock.calls.every((call) => call[2] === mapping.eventId),
    ).toBe(true);
  });
  it("settles a crashed final attempt without making any fourth provider attempt", async () => {
    google.event.mockRejectedValueOnce(new MeetError("PROVIDER_UNAVAILABLE"));
    await expect(service.synchronize(owner, meetingId)).rejects.toBeInstanceOf(
      MeetError,
    );
    await db.googleMeetExport.update({
      where: { meetingId },
      data: { attempts: 3, nextAttemptAt: new Date(0), status: "PENDING" },
    });
    google.refresh.mockClear();
    await service.reconcileDueExports();
    const mapping = await db.googleMeetExport.findUniqueOrThrow({
      where: { meetingId },
    });
    expect(mapping.status).toBe("FAILED");
    expect(mapping.failure).toBe("RETRY_EXHAUSTED");
    expect(mapping.nextAttemptAt).toBeNull();
    expect(google.refresh).not.toHaveBeenCalled();
  });
});
