import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MeetingParticipantResponse,
  MeetingStatus,
  MeetingType,
  type PermissionScope,
} from "../src/generated/prisma/client.js";
import type { MeetingRecord } from "../src/meetings/infrastructure/meetings.repository.js";
import { MeetingsService } from "../src/meetings/meetings.service.js";

const ACTOR = "20000000-0000-4000-8000-000000000001";
const PARTICIPANT = "20000000-0000-4000-8000-000000000002";

function makeMeeting(overrides: Partial<MeetingRecord> = {}): MeetingRecord {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    workspaceId: null,
    title: "Production stand-up",
    description: null,
    type: MeetingType.ONLINE,
    status: MeetingStatus.SCHEDULED,
    organizer: {
      id: ACTOR,
      email: "organizer@example.test",
      firstName: "Orla",
      lastName: "Organizer",
    },
    startAt: new Date("2030-01-01T10:00:00.000Z"),
    endAt: new Date("2030-01-01T11:00:00.000Z"),
    location: null,
    onlineLink: "https://meet.example.test/stand-up",
    reminderAt: new Date("2030-01-01T09:45:00.000Z"),
    participants: [],
    createdAt: new Date("2029-12-01T00:00:00.000Z"),
    updatedAt: new Date("2029-12-01T00:00:00.000Z"),
    ...overrides,
  };
}

async function expectCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(HttpException);
  await promise.catch((error: unknown) => {
    expect(
      ((error as HttpException).getResponse() as { code: string }).code,
    ).toBe(code);
  });
}

describe("MeetingsService", () => {
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
  let service: MeetingsService;

  beforeEach(() => {
    repository = {
      findUserDepartmentId: vi.fn().mockResolvedValue("department-1"),
      workspaceExists: vi.fn().mockResolvedValue(true),
      workspaceAccessibleToUser: vi.fn().mockResolvedValue(true),
      activeUsersExist: vi.fn().mockResolvedValue(true),
      activeUsersBelongToDepartment: vi.fn().mockResolvedValue(true),
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findById: vi.fn().mockResolvedValue(makeMeeting()),
      findVisibleById: vi.fn().mockResolvedValue(makeMeeting()),
      create: vi.fn().mockResolvedValue(makeMeeting()),
      update: vi.fn().mockResolvedValue(makeMeeting()),
      addParticipant: vi.fn().mockResolvedValue(makeMeeting()),
      removeParticipant: vi.fn().mockResolvedValue(makeMeeting()),
      respond: vi.fn().mockResolvedValue({
        response: MeetingParticipantResponse.ACCEPTED,
        respondedAt: new Date("2030-01-01T08:00:00.000Z"),
      }),
      transition: vi
        .fn()
        .mockResolvedValue(makeMeeting({ status: MeetingStatus.COMPLETED })),
      availability: vi.fn().mockResolvedValue(new Map()),
    };
    permissions = { hasGrant: vi.fn().mockResolvedValue(false) };
    service = new MeetingsService(repository as never, permissions as never);
  });

  function grantOnly(...allowed: [string, PermissionScope][]): void {
    permissions.hasGrant.mockImplementation((_userId, key, scope) =>
      Promise.resolve(
        allowed.some(
          ([allowedKey, allowedScope]) =>
            allowedKey === key && allowedScope === scope,
        ),
      ),
    );
  }

  it("builds self visibility for invited participants without accepting a client owner", async () => {
    grantOnly(["meeting.read", "SELF"]);
    await service.list(ACTOR, { page: 1, pageSize: 25 });
    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({
        visibility: { organization: false, selfUserId: ACTOR },
      }),
    );
  });

  it("does not reveal an absent or out-of-scope id to a narrow caller", async () => {
    grantOnly(["meeting.read", "SELF"]);
    repository.findVisibleById!.mockResolvedValue(null);
    await expectCode(service.get(ACTOR, "missing"), "PERMISSION_DENIED");

    grantOnly(["meeting.read", "ORGANIZATION"]);
    await expectCode(service.get(ACTOR, "missing"), "MEETING_NOT_FOUND");
  });

  it("rejects invalid type-specific venue data before persistence", async () => {
    grantOnly(["meeting.create", "ORGANIZATION"]);
    await expectCode(
      service.create(
        ACTOR,
        {
          title: "In-person briefing",
          type: MeetingType.PHYSICAL,
          startAt: "2030-01-01T10:00:00.000Z",
          endAt: "2030-01-01T11:00:00.000Z",
          participantIds: [],
        },
        "request-1",
      ),
      "MEETING_VENUE_INVALID",
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("creates valid UTC meeting input with the authenticated user as organizer", async () => {
    grantOnly(["meeting.create", "ORGANIZATION"]);
    await service.create(
      ACTOR,
      {
        title: " Online briefing ",
        type: MeetingType.ONLINE,
        onlineLink: "https://meet.example.test/briefing",
        startAt: "2030-01-01T10:00:00.000Z",
        endAt: "2030-01-01T11:00:00.000Z",
        participantIds: [PARTICIPANT],
      },
      "request-1",
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizerId: ACTOR,
        title: "Online briefing",
        participantIds: [PARTICIPANT],
      }),
    );
  });

  it("allows only an invited user to acknowledge once", async () => {
    grantOnly(["meeting.respond", "SELF"]);
    await expect(
      service.respond(ACTOR, "meeting-1", MeetingParticipantResponse.ACCEPTED),
    ).resolves.toMatchObject({
      response: MeetingParticipantResponse.ACCEPTED,
    });

    repository.respond!.mockResolvedValue("already_acknowledged");
    await expectCode(
      service.respond(ACTOR, "meeting-1", MeetingParticipantResponse.DECLINED),
      "MEETING_RESPONSE_ALREADY_ACKNOWLEDGED",
    );
  });

  it("requires organizer ownership even when the user has an organization update grant", async () => {
    grantOnly(["meeting.update", "ORGANIZATION"]);
    repository.findById!.mockResolvedValue(
      makeMeeting({
        organizer: { ...makeMeeting().organizer, id: PARTICIPANT },
      }),
    );
    await expectCode(
      service.update(ACTOR, "meeting-1", { title: "No" }),
      "PERMISSION_DENIED",
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("reports conflict counts without exposing meeting details", async () => {
    grantOnly(["meeting.read", "DEPARTMENT"]);
    repository.availability!.mockResolvedValue(new Map([[PARTICIPANT, 2]]));
    await expect(
      service.availability(ACTOR, {
        userIds: [PARTICIPANT],
        startAt: "2030-01-01T10:00:00.000Z",
        endAt: "2030-01-01T11:00:00.000Z",
      }),
    ).resolves.toEqual({
      startAt: "2030-01-01T10:00:00.000Z",
      endAt: "2030-01-01T11:00:00.000Z",
      users: [
        { userId: PARTICIPANT, available: false, conflictingMeetingCount: 2 },
      ],
    });
  });
});
