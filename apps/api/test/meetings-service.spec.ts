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
    reminderAt: new Date("2030-01-01T09:45:00.000Z"),
    agenda: null,
    minutes: null,
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
  let tasks: Record<string, ReturnType<typeof vi.fn>>;
  let jitsi: Record<string, ReturnType<typeof vi.fn>>;
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
      remove: vi.fn().mockResolvedValue("removed"),
      addParticipant: vi.fn().mockResolvedValue(makeMeeting()),
      removeParticipant: vi.fn().mockResolvedValue(makeMeeting()),
      respond: vi.fn().mockResolvedValue({
        response: MeetingParticipantResponse.ACCEPTED,
        respondedAt: new Date("2030-01-01T08:00:00.000Z"),
      }),
      transition: vi
        .fn()
        .mockResolvedValue(makeMeeting({ status: MeetingStatus.COMPLETED })),
      setMinutes: vi
        .fn()
        .mockResolvedValue(makeMeeting({ minutes: "Decided X." })),
      linkActionItem: vi.fn().mockResolvedValue(undefined),
      availability: vi.fn().mockResolvedValue(new Map()),
    };
    permissions = { hasGrant: vi.fn().mockResolvedValue(false) };
    tasks = {
      create: vi.fn().mockResolvedValue({ id: "task-1" }),
      addAssignee: vi.fn().mockResolvedValue({ id: "task-1" }),
    };
    jitsi = {
      buildSession: vi.fn().mockReturnValue({
        domain: "meet.example.test",
        roomName: "lela-meeting-1",
        displayName: "Orla Organizer",
        moderator: true,
        jwt: null,
      }),
    };
    service = new MeetingsService(
      repository as never,
      permissions as never,
      tasks as never,
      jitsi as never,
    );
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

  describe("meeting editing and removal", () => {
    it("allows an organizer to edit a completed meeting", async () => {
      grantOnly(["meeting.update", "ORGANIZATION"]);
      const completed = makeMeeting({
        status: MeetingStatus.COMPLETED,
        title: "Corrected title",
      });
      repository.findById!.mockResolvedValue(completed);
      repository.update!.mockResolvedValue(completed);
      await expect(
        service.update(ACTOR, completed.id, { title: "Corrected title" }),
      ).resolves.toMatchObject({
        title: "Corrected title",
        status: "COMPLETED",
      });
    });
    it("keeps cancelled meetings immutable", async () => {
      grantOnly(["meeting.update", "ORGANIZATION"]);
      repository.findById!.mockResolvedValue(
        makeMeeting({ status: MeetingStatus.CANCELLED }),
      );
      await expectCode(
        service.update(ACTOR, "meeting-1", { title: "No" }),
        "MEETING_CANCELLED",
      );
      expect(repository.update).not.toHaveBeenCalled();
    });
    it.each([
      MeetingStatus.SCHEDULED,
      MeetingStatus.COMPLETED,
      MeetingStatus.CANCELLED,
    ])("allows an organizer to remove a %s meeting", async (status) => {
      grantOnly(["meeting.update", "ORGANIZATION"]);
      repository.findById!.mockResolvedValue(makeMeeting({ status }));
      await expect(service.remove(ACTOR, "meeting-1")).resolves.toBeUndefined();
      expect(repository.remove).toHaveBeenCalledWith("meeting-1", ACTOR);
    });
    it("rejects deletion by a different organizer despite broad permissions", async () => {
      grantOnly(["meeting.update", "ORGANIZATION"]);
      repository.findById!.mockResolvedValue(
        makeMeeting({
          organizer: { ...makeMeeting().organizer, id: PARTICIPANT },
        }),
      );
      await expectCode(service.remove(ACTOR, "meeting-1"), "PERMISSION_DENIED");
      expect(repository.remove).not.toHaveBeenCalled();
    });
    it("rejects deletion without an update grant", async () => {
      await expectCode(service.remove(ACTOR, "meeting-1"), "PERMISSION_DENIED");
      expect(repository.remove).not.toHaveBeenCalled();
    });
    it("returns not found when a meeting disappears before the delete commits", async () => {
      grantOnly(["meeting.update", "ORGANIZATION"]);
      repository.remove!.mockResolvedValue("not_found");
      await expectCode(service.remove(ACTOR, "meeting-1"), "MEETING_NOT_FOUND");
    });
  });

  describe("setMinutes", () => {
    it("allows recording minutes on a completed meeting", async () => {
      grantOnly(["meeting.update", "ORGANIZATION"]);
      repository.findById!.mockResolvedValue(
        makeMeeting({ status: MeetingStatus.COMPLETED }),
      );
      await expect(
        service.setMinutes(ACTOR, "meeting-1", "  Decided X.  "),
      ).resolves.toMatchObject({ minutes: "Decided X." });
      expect(repository.setMinutes).toHaveBeenCalledWith(
        "meeting-1",
        ACTOR,
        "Decided X.",
      );
    });

    it("rejects recording minutes on a cancelled meeting", async () => {
      grantOnly(["meeting.update", "ORGANIZATION"]);
      repository.findById!.mockResolvedValue(
        makeMeeting({ status: MeetingStatus.CANCELLED }),
      );
      repository.setMinutes!.mockResolvedValue("cancelled");
      await expectCode(
        service.setMinutes(ACTOR, "meeting-1", "Decided X."),
        "MEETING_CANCELLED",
      );
    });

    it("requires organizer ownership", async () => {
      grantOnly(["meeting.update", "ORGANIZATION"]);
      repository.findById!.mockResolvedValue(
        makeMeeting({
          organizer: { ...makeMeeting().organizer, id: PARTICIPANT },
        }),
      );
      await expectCode(
        service.setMinutes(ACTOR, "meeting-1", "Decided X."),
        "PERMISSION_DENIED",
      );
      expect(repository.setMinutes).not.toHaveBeenCalled();
    });
  });

  describe("createActionItem", () => {
    it("creates a task scoped to the meeting's workspace and links it back", async () => {
      grantOnly(["meeting.update", "ORGANIZATION"]);
      repository.findById!.mockResolvedValue(
        makeMeeting({ workspaceId: "ws-1" }),
      );
      const result = await service.createActionItem(
        ACTOR,
        "meeting-1",
        { title: "Confirm venue permits" },
        "request-1",
      );
      expect(result).toEqual({ id: "task-1" });
      expect(tasks.create).toHaveBeenCalledWith(
        ACTOR,
        expect.objectContaining({
          title: "Confirm venue permits",
          workspaceId: "ws-1",
        }),
        "request-1",
      );
      expect(repository.linkActionItem).toHaveBeenCalledWith(
        "task-1",
        "meeting-1",
      );
      expect(tasks.addAssignee).not.toHaveBeenCalled();
    });

    it("falls back to the organizer's own department when the meeting has no workspace", async () => {
      grantOnly(["meeting.update", "ORGANIZATION"]);
      repository.findById!.mockResolvedValue(
        makeMeeting({ workspaceId: null }),
      );
      repository.findUserDepartmentId!.mockResolvedValue("department-9");
      await service.createActionItem(
        ACTOR,
        "meeting-1",
        { title: "Follow up" },
        "request-1",
      );
      expect(tasks.create).toHaveBeenCalledWith(
        ACTOR,
        expect.objectContaining({ departmentId: "department-9" }),
        "request-1",
      );
    });

    it("assigns the task immediately when an assignee is given", async () => {
      grantOnly(["meeting.update", "ORGANIZATION"]);
      repository.findById!.mockResolvedValue(
        makeMeeting({ workspaceId: "ws-1" }),
      );
      await service.createActionItem(
        ACTOR,
        "meeting-1",
        { title: "Follow up", assigneeId: PARTICIPANT },
        "request-1",
      );
      expect(tasks.addAssignee).toHaveBeenCalledWith(
        ACTOR,
        "task-1",
        PARTICIPANT,
        "request-1",
      );
    });
  });

  describe("getJitsiSession", () => {
    it("builds a session for the organizer", async () => {
      grantOnly(["meeting.read", "ORGANIZATION"]);
      await expect(
        service.getJitsiSession(ACTOR, "meeting-1"),
      ).resolves.toMatchObject({ domain: "meet.example.test" });
      expect(jitsi.buildSession).toHaveBeenCalledWith(
        makeMeeting(),
        expect.objectContaining({ userId: ACTOR, isOrganizer: true }),
      );
    });

    it("builds a session for an invited participant", async () => {
      grantOnly(["meeting.read", "SELF"]);
      repository.findById!.mockResolvedValue(
        makeMeeting({
          participants: [
            {
              id: PARTICIPANT,
              email: "participant@example.test",
              firstName: "Pat",
              lastName: "Participant",
              response: MeetingParticipantResponse.ACCEPTED,
              respondedAt: new Date("2030-01-01T08:00:00.000Z"),
              invitedAt: new Date("2029-12-01T00:00:00.000Z"),
            },
          ],
        }),
      );
      await service.getJitsiSession(PARTICIPANT, "meeting-1");
      expect(jitsi.buildSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: PARTICIPANT,
          isOrganizer: false,
        }),
      );
    });

    it("denies a reader who is neither the organizer nor an invited participant", async () => {
      grantOnly(["meeting.read", "ORGANIZATION"]);
      await expectCode(
        service.getJitsiSession(PARTICIPANT, "meeting-1"),
        "PERMISSION_DENIED",
      );
      expect(jitsi.buildSession).not.toHaveBeenCalled();
    });

    it("rejects a physical meeting", async () => {
      grantOnly(["meeting.read", "ORGANIZATION"]);
      repository.findById!.mockResolvedValue(
        makeMeeting({ type: MeetingType.PHYSICAL, location: "Office" }),
      );
      await expectCode(
        service.getJitsiSession(ACTOR, "meeting-1"),
        "MEETING_NOT_ONLINE",
      );
      expect(jitsi.buildSession).not.toHaveBeenCalled();
    });

    it("reports a missing meeting", async () => {
      grantOnly(["meeting.read", "ORGANIZATION"]);
      repository.findById!.mockResolvedValue(null);
      await expectCode(
        service.getJitsiSession(ACTOR, "missing"),
        "MEETING_NOT_FOUND",
      );
    });
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
