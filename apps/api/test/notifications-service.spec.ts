import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  NotificationType,
  OutboxActorKind,
} from "../src/generated/prisma/client.js";
import type { ClaimedOutboxDelivery } from "../src/outbox/outbox.types.js";
import type {
  CreateNotificationInput,
  NotificationRecord,
} from "../src/notifications/infrastructure/notifications.repository.js";
import { NotificationsService } from "../src/notifications/notifications.service.js";

const ACTOR = "actor-1";

function makeNotification(
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord {
  return {
    id: "notification-1",
    type: NotificationType.TASK_ASSIGNED,
    title: "You were assigned a task",
    body: "Confirm venue permits",
    taskId: "task-1",
    messageId: null,
    eventId: null,
    meetingId: null,
    expenseId: null,
    reportId: null,
    partnerId: null,
    letterId: null,
    documentId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    readAt: null,
    ...overrides,
  };
}

function makeEvent(
  overrides: Partial<ClaimedOutboxDelivery["event"]> = {},
): ClaimedOutboxDelivery["event"] {
  return {
    id: "event-1",
    name: "task.assigned",
    version: 1,
    occurredAt: new Date("2026-01-01T00:00:00.000Z"),
    actorKind: OutboxActorKind.USER,
    actorUserId: "actor-1",
    correlationId: null,
    resourceType: "task",
    resourceId: "task-1",
    workspaceContext: null,
    payload: {},
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

describe("NotificationsService", () => {
  let repository: Record<string, ReturnType<typeof vi.fn>>;
  let permissions: { hasGrant: ReturnType<typeof vi.fn> };
  let realtime: { publish: ReturnType<typeof vi.fn> };
  let service: NotificationsService;

  beforeEach(() => {
    repository = {
      createIfAbsent: vi.fn().mockResolvedValue(makeNotification()),
      isMuted: vi.fn().mockResolvedValue(false),
      listFeed: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      unreadCount: vi.fn().mockResolvedValue(0),
      markRead: vi.fn().mockResolvedValue(makeNotification()),
      dismiss: vi.fn().mockResolvedValue(makeNotification()),
      listMutedTypes: vi.fn().mockResolvedValue([]),
      setMuted: vi.fn().mockResolvedValue(undefined),
      getTask: vi.fn().mockResolvedValue({
        title: "Confirm venue permits",
        workspaceId: null,
      }),
      isUserActive: vi.fn().mockResolvedValue(true),
      getTaskAssigneeIds: vi.fn().mockResolvedValue([]),
      getMeeting: vi.fn().mockResolvedValue({
        title: "Production stand-up",
        status: "SCHEDULED",
      }),
      isMeetingParticipant: vi.fn().mockResolvedValue(true),
      getMeetingReminderRecipientIds: vi.fn().mockResolvedValue([]),
      getMessage: vi.fn().mockResolvedValue({
        conversationId: "conversation-1",
        authorId: "author-1",
        content: "hello",
      }),
      getConversationMemberIds: vi.fn().mockResolvedValue([]),
      getMessageMentionUserIds: vi.fn().mockResolvedValue([]),
      getReport: vi.fn().mockResolvedValue({
        title: "Daily report",
        authorId: "author-1",
        departmentId: null,
        status: "DRAFT",
      }),
      getReportReviewerIds: vi.fn().mockResolvedValue([]),
      getTodo: vi.fn().mockResolvedValue({
        title: "Confirm venue permits",
        userId: "owner-1",
        status: "NOT_STARTED",
      }),
      getEvent: vi.fn().mockResolvedValue({
        name: "Autumn Product Launch",
        status: "PLANNING",
      }),
      getEventReminderRecipientIds: vi.fn().mockResolvedValue([]),
      getPartner: vi.fn().mockResolvedValue({
        organizationName: "Northbridge Media",
        ownerId: "owner-1",
        status: "PROSPECTIVE",
      }),
      getShare: vi.fn().mockResolvedValue({
        recipientId: "recipient-1",
        allEmployees: false,
        revokedAt: null,
      }),
      getLetter: vi.fn().mockResolvedValue({
        referenceNumber: "LELA-CAST-2026-001",
      }),
      getDocument: vi.fn().mockResolvedValue({
        displayName: "Vendor contract",
      }),
      listActiveUserIds: vi.fn().mockResolvedValue([]),
      getEventShift: vi.fn().mockResolvedValue({
        eventName: "Launch Night",
        status: "CONFIRMED",
      }),
      hasActiveShiftAssignment: vi.fn().mockResolvedValue(true),
      getShiftAssignedEmployeeIds: vi.fn().mockResolvedValue([]),
      getOvertimeApproval: vi.fn().mockResolvedValue({
        status: "APPROVED",
        employeeId: "employee-1",
        sessionDate: new Date("2026-11-01T00:00:00Z"),
      }),
      getAttendanceException: vi.fn().mockResolvedValue({
        status: "APPROVED",
        employeeId: "employee-1",
        description: "Recorded 500m away",
      }),
      getLeaveRequest: vi.fn().mockResolvedValue({
        status: "PENDING",
        employeeId: "employee-1",
        employeeName: "Employee One",
        employeeDepartmentId: "dept-1",
        leaveTypeName: "Annual",
      }),
      getDepartmentManagerId: vi.fn().mockResolvedValue("manager-1"),
    };
    permissions = { hasGrant: vi.fn().mockResolvedValue(true) };
    realtime = { publish: vi.fn() };
    service = new NotificationsService(
      repository as never,
      permissions as never,
      realtime as never,
    );
  });

  it("removes only an owned notification and invalidates the caller's live feed", async () => {
    await service.remove(ACTOR, "notification-1");
    expect(repository.dismiss).toHaveBeenCalledWith(ACTOR, "notification-1");
    expect(realtime.publish).toHaveBeenCalledWith(
      "user:actor-1",
      "notification.invalidated",
      1,
      {
        notificationId: "notification-1",
        type: NotificationType.TASK_ASSIGNED,
      },
    );
    repository.dismiss!.mockResolvedValue(null);
    await expectCode(
      service.remove(ACTOR, "someone-elses-id"),
      "NOTIFICATION_NOT_FOUND",
    );
  });
  it("denies every self-scoped operation when the caller lacks notification.read at SELF", async () => {
    permissions.hasGrant.mockResolvedValue(false);
    await expectCode(
      service.listFeed(ACTOR, { limit: 25 }),
      "PERMISSION_DENIED",
    );
    await expectCode(service.unreadCount(ACTOR), "PERMISSION_DENIED");
    await expectCode(
      service.remove(ACTOR, "notification-1"),
      "PERMISSION_DENIED",
    );
    await expectCode(
      service.markRead(ACTOR, "notification-1"),
      "PERMISSION_DENIED",
    );
    await expectCode(service.listPreferences(ACTOR), "PERMISSION_DENIED");
    await expectCode(
      service.setPreference(ACTOR, "NEW_MESSAGE", true),
      "PERMISSION_DENIED",
    );
    expect(permissions.hasGrant).toHaveBeenCalledWith(
      ACTOR,
      "notification.read",
      "SELF",
    );
  });

  it("maps an unknown or someone-else's notification id to a stable not-found", async () => {
    repository.markRead!.mockResolvedValue("not_found");
    await expectCode(
      service.markRead(ACTOR, "missing"),
      "NOTIFICATION_NOT_FOUND",
    );
  });

  it("rejects a garbage type before checking mutability", async () => {
    await expectCode(
      service.setPreference(ACTOR, "NOT_A_TYPE", true),
      "NOTIFICATION_TYPE_INVALID",
    );
    expect(repository.setMuted).not.toHaveBeenCalled();
  });

  it("rejects muting a type that represents a direct action, outcome, or obligation", async () => {
    await expectCode(
      service.setPreference(ACTOR, NotificationType.TASK_ASSIGNED, true),
      "NOTIFICATION_TYPE_NOT_MUTABLE",
    );
    await expectCode(
      service.setPreference(ACTOR, NotificationType.MESSAGE_MENTION, true),
      "NOTIFICATION_TYPE_NOT_MUTABLE",
    );
    expect(repository.setMuted).not.toHaveBeenCalled();
  });

  it("persists a mutable type's mute state", async () => {
    await service.setPreference(ACTOR, NotificationType.NEW_MESSAGE, true);
    expect(repository.setMuted).toHaveBeenCalledWith(
      ACTOR,
      NotificationType.NEW_MESSAGE,
      true,
    );
  });

  it("lists only the mutable types with the caller's mute state", async () => {
    repository.listMutedTypes!.mockResolvedValue([
      NotificationType.NEW_MESSAGE,
    ]);
    const result = await service.listPreferences(ACTOR);
    expect(result.items).toHaveLength(10);
    expect(result.items).toEqual(
      expect.arrayContaining([
        { type: NotificationType.NEW_MESSAGE, muted: true },
        { type: NotificationType.TASK_DUE, muted: false },
      ]),
    );
  });

  describe("processEvent: task.assigned", () => {
    it("creates a notification for the assignee and publishes the advisory frame", async () => {
      const event = makeEvent({
        name: "task.assigned",
        payload: { assigneeUserId: "assignee-1" },
      });
      repository.createIfAbsent!.mockResolvedValue(
        makeNotification({ id: "created-1" }),
      );
      await service.processEvent(event);
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: "assignee-1",
          type: NotificationType.TASK_ASSIGNED,
          sourceEventId: "event-1",
          occurrenceKey: "event-1",
          taskId: "task-1",
        }),
      );
      // The envelope's eventId is the originating domain event's id
      // (event.id / sourceEventId), not the notification's own id - so a
      // multi-recipient fan-out can still be correlated back to one event.
      expect(realtime.publish).toHaveBeenCalledWith(
        "user:assignee-1",
        "notification.invalidated",
        1,
        expect.objectContaining({ notificationId: "created-1" }),
        "event-1",
      );
    });

    it("does nothing when the task no longer exists", async () => {
      repository.getTask!.mockResolvedValue(null);
      await service.processEvent(
        makeEvent({ payload: { assigneeUserId: "assignee-1" } }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });

    it("does not publish when creation reports a duplicate", async () => {
      repository.createIfAbsent!.mockResolvedValue("duplicate");
      await service.processEvent(
        makeEvent({ payload: { assigneeUserId: "assignee-1" } }),
      );
      expect(realtime.publish).not.toHaveBeenCalled();
    });

    it("does not notify a user who assigns the task to themselves", async () => {
      await service.processEvent(
        makeEvent({
          actorUserId: "actor-1",
          payload: { assigneeUserId: "actor-1" },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });

    it("does not notify an assignee who is no longer an active user", async () => {
      repository.isUserActive!.mockResolvedValue(false);
      await service.processEvent(
        makeEvent({ payload: { assigneeUserId: "assignee-1" } }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });

    it("waits for durable persistence before publishing the advisory frame", async () => {
      let resolveCreate!: (notification: NotificationRecord) => void;
      const persistence = new Promise<NotificationRecord>((resolve) => {
        resolveCreate = resolve;
      });
      repository.createIfAbsent!.mockReturnValue(persistence);

      const processing = service.processEvent(
        makeEvent({ payload: { assigneeUserId: "assignee-1" } }),
      );
      await vi.waitFor(() => {
        expect(repository.createIfAbsent).toHaveBeenCalledOnce();
      });

      expect(realtime.publish).not.toHaveBeenCalled();

      resolveCreate(makeNotification({ id: "created-1" }));
      await processing;
      expect(realtime.publish).toHaveBeenCalledWith(
        "user:assignee-1",
        "notification.invalidated",
        1,
        expect.objectContaining({ notificationId: "created-1" }),
        "event-1",
      );
    });

    it("never publishes when persistence fails", async () => {
      repository.createIfAbsent!.mockRejectedValue(
        new Error("database unavailable"),
      );

      await expect(
        service.processEvent(
          makeEvent({ payload: { assigneeUserId: "assignee-1" } }),
        ),
      ).rejects.toThrow("database unavailable");

      expect(realtime.publish).not.toHaveBeenCalled();
    });
  });

  describe("processEvent: task.reviewed", () => {
    it("notifies every current assignee except the reviewer, mapping outcome to type", async () => {
      repository.getTaskAssigneeIds!.mockResolvedValue([
        "assignee-1",
        "assignee-2",
      ]);
      await service.processEvent(
        makeEvent({
          name: "task.reviewed",
          actorUserId: "reviewer-1",
          payload: { outcome: "APPROVED", reviewId: "review-1" },
        }),
      );
      expect(repository.getTaskAssigneeIds).toHaveBeenCalledWith(
        "task-1",
        "reviewer-1",
      );
      expect(repository.createIfAbsent).toHaveBeenCalledTimes(2);
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: "assignee-1",
          type: NotificationType.TASK_APPROVED,
        }),
      );
    });

    it("publishes the same eventId for every frame in a multi-recipient fan-out from one domain event", async () => {
      repository.getTaskAssigneeIds!.mockResolvedValue([
        "assignee-1",
        "assignee-2",
      ]);
      // Distinct notification ids per recipient, to prove the shared
      // eventId below is the domain event's id, not a notification's own id.
      repository.createIfAbsent = vi.fn((input: CreateNotificationInput) =>
        Promise.resolve(
          makeNotification({
            id: `notification-for-${input.recipientUserId}`,
          }),
        ),
      );
      await service.processEvent(
        makeEvent({
          name: "task.reviewed",
          payload: { outcome: "APPROVED", reviewId: "review-1" },
        }),
      );
      expect(realtime.publish).toHaveBeenCalledTimes(2);
      for (const call of realtime.publish.mock.calls as unknown[][]) {
        expect(call[4]).toBe("event-1");
      }
    });

    it("maps CHANGES_REQUESTED to TASK_REJECTED", async () => {
      repository.getTaskAssigneeIds!.mockResolvedValue(["assignee-1"]);
      await service.processEvent(
        makeEvent({
          name: "task.reviewed",
          payload: { outcome: "CHANGES_REQUESTED", reviewId: "review-1" },
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.TASK_REJECTED }),
      );
    });
  });

  describe("processEvent: meeting invitation and reminder", () => {
    it("notifies the newly invited active participant with a concrete meeting target", async () => {
      await service.processEvent(
        makeEvent({
          name: "meeting.participant.invited",
          resourceType: "meeting",
          resourceId: "meeting-1",
          payload: { participantUserId: "participant-1" },
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: "participant-1",
          type: NotificationType.MEETING_INVITATION,
          meetingId: "meeting-1",
          occurrenceKey: "event-1",
        }),
      );
    });

    it("suppresses a delayed invitation after the participant was removed", async () => {
      repository.isMeetingParticipant!.mockResolvedValue(false);
      await service.processEvent(
        makeEvent({
          name: "meeting.participant.invited",
          resourceType: "meeting",
          resourceId: "meeting-1",
          payload: { participantUserId: "participant-1" },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });

    it("suppresses delayed meeting events after the meeting is terminal", async () => {
      repository.getMeeting!.mockResolvedValue({
        title: "Production stand-up",
        status: "CANCELLED",
      });
      await service.processEvent(
        makeEvent({
          name: "meeting.reminder",
          resourceType: "meeting",
          resourceId: "meeting-1",
          payload: {
            occurrenceKey:
              "meeting-1:2030-01-01T09:45:00.000Z:meeting.reminder:v1",
          },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });

    it("reminds only current eligible participants and honors reminder mutes", async () => {
      repository.getMeetingReminderRecipientIds!.mockResolvedValue([
        "participant-1",
        "participant-2",
      ]);
      repository.isMuted!.mockImplementation(
        (userId: string) => userId === "participant-2",
      );
      await service.processEvent(
        makeEvent({
          name: "meeting.reminder",
          actorKind: OutboxActorKind.SYSTEM,
          actorUserId: null,
          resourceType: "meeting",
          resourceId: "meeting-1",
          payload: {
            occurrenceKey:
              "meeting-1:2030-01-01T09:45:00.000Z:meeting.reminder:v1",
          },
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledTimes(1);
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: "participant-1",
          type: NotificationType.MEETING_REMINDER,
          meetingId: "meeting-1",
        }),
      );
    });
  });

  describe("processEvent: task.due / task.overdue", () => {
    it("notifies every current active assignee using the scheduler's own occurrence key", async () => {
      repository.getTaskAssigneeIds!.mockResolvedValue([
        "assignee-1",
        "assignee-2",
      ]);
      await service.processEvent(
        makeEvent({
          name: "task.due",
          actorKind: OutboxActorKind.SYSTEM,
          actorUserId: null,
          payload: {
            occurrenceKey: "task-1:2026-02-01T09:00:00.000Z:task.due:v1",
          },
        }),
      );
      expect(repository.getTaskAssigneeIds).toHaveBeenCalledWith("task-1");
      expect(repository.createIfAbsent).toHaveBeenCalledTimes(2);
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: "assignee-1",
          type: NotificationType.TASK_DUE,
          sourceEventId: "event-1",
          occurrenceKey: "task-1:2026-02-01T09:00:00.000Z:task.due:v1",
          taskId: "task-1",
        }),
      );
    });

    it("maps task.overdue to TASK_OVERDUE", async () => {
      repository.getTaskAssigneeIds!.mockResolvedValue(["assignee-1"]);
      await service.processEvent(
        makeEvent({
          name: "task.overdue",
          payload: {
            occurrenceKey: "task-1:2026-02-01T09:00:00.000Z:task.overdue:v1",
          },
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.TASK_OVERDUE }),
      );
    });

    it("respects a muted TASK_DUE/TASK_OVERDUE preference", async () => {
      repository.getTaskAssigneeIds!.mockResolvedValue(["assignee-1"]);
      repository.isMuted!.mockResolvedValue(true);
      await service.processEvent(
        makeEvent({
          name: "task.due",
          payload: {
            occurrenceKey: "task-1:2026-02-01T09:00:00.000Z:task.due:v1",
          },
        }),
      );
      expect(repository.isMuted).toHaveBeenCalledWith(
        "assignee-1",
        NotificationType.TASK_DUE,
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });

    it("does nothing when the payload has no occurrenceKey or the task no longer exists", async () => {
      await service.processEvent(makeEvent({ name: "task.due", payload: {} }));
      expect(repository.createIfAbsent).not.toHaveBeenCalled();

      repository.getTask!.mockResolvedValue(null);
      await service.processEvent(
        makeEvent({
          name: "task.due",
          payload: {
            occurrenceKey: "task-1:2026-02-01T09:00:00.000Z:task.due:v1",
          },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });
  });

  describe("processEvent: discuss.message.created", () => {
    it("notifies conversation members (NEW_MESSAGE) and mentioned users (MESSAGE_MENTION), skipping the author and muted members", async () => {
      repository.getConversationMemberIds!.mockResolvedValue([
        "member-1",
        "member-2",
      ]);
      repository.getMessageMentionUserIds!.mockResolvedValue(["member-2"]);
      repository.isMuted = vi.fn((userId: string) =>
        Promise.resolve(userId === "member-1"),
      );
      await service.processEvent(
        makeEvent({
          name: "discuss.message.created",
          resourceType: "message",
          resourceId: "message-1",
          payload: { conversationId: "conversation-1" },
        }),
      );

      const createCalls = repository.createIfAbsent!.mock.calls as [
        CreateNotificationInput,
      ][];
      const newMessageCalls = createCalls.filter(
        ([input]) => input.type === NotificationType.NEW_MESSAGE,
      );
      expect(newMessageCalls).toHaveLength(1);
      expect(newMessageCalls[0]![0]).toMatchObject({
        recipientUserId: "member-2",
        messageId: "message-1",
      });

      const mentionCalls = createCalls.filter(
        ([input]) => input.type === NotificationType.MESSAGE_MENTION,
      );
      expect(mentionCalls).toHaveLength(1);
      expect(mentionCalls[0]![0]).toMatchObject({
        recipientUserId: "member-2",
        messageId: "message-1",
      });
    });

    it("does nothing when the message no longer exists", async () => {
      repository.getMessage!.mockResolvedValue(null);
      await service.processEvent(
        makeEvent({ name: "discuss.message.created", resourceId: "message-1" }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });

    it("never notifies a mentioned user who is not a current conversation member", async () => {
      repository.getConversationMemberIds!.mockResolvedValue(["member-1"]);
      repository.getMessageMentionUserIds!.mockResolvedValue([
        "member-1",
        "outsider-1",
      ]);
      await service.processEvent(
        makeEvent({
          name: "discuss.message.created",
          resourceType: "message",
          resourceId: "message-1",
          payload: { conversationId: "conversation-1" },
        }),
      );

      const createCalls = repository.createIfAbsent!.mock.calls as [
        CreateNotificationInput,
      ][];
      const mentionCalls = createCalls.filter(
        ([input]) => input.type === NotificationType.MESSAGE_MENTION,
      );
      expect(mentionCalls).toHaveLength(1);
      expect(mentionCalls[0]![0].recipientUserId).toBe("member-1");
      expect(
        createCalls.some(([input]) => input.recipientUserId === "outsider-1"),
      ).toBe(false);
    });
  });

  describe("processEvent: report.submitted", () => {
    it("notifies every resolved reviewer except the submitting author", async () => {
      repository.getReportReviewerIds!.mockResolvedValue([
        "reviewer-1",
        "reviewer-2",
        "actor-1",
      ]);
      await service.processEvent(
        makeEvent({
          name: "report.submitted",
          resourceType: "report",
          resourceId: "report-1",
          actorUserId: "actor-1",
        }),
      );
      expect(repository.getReportReviewerIds).toHaveBeenCalledWith(null);
      expect(repository.createIfAbsent).toHaveBeenCalledTimes(2);
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: "reviewer-1",
          type: NotificationType.REPORT_SUBMITTED,
          reportId: "report-1",
        }),
      );
      expect(
        (repository.createIfAbsent!.mock.calls as [CreateNotificationInput][])
          .map(([input]) => input.recipientUserId)
          .includes("actor-1"),
      ).toBe(false);
    });

    it("does nothing when the report no longer exists", async () => {
      repository.getReport!.mockResolvedValue(null);
      await service.processEvent(
        makeEvent({
          name: "report.submitted",
          resourceType: "report",
          resourceId: "report-1",
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });
  });

  describe("processEvent: report.reviewed", () => {
    it("notifies the author with REPORT_REVIEWED on a REVIEWED outcome", async () => {
      await service.processEvent(
        makeEvent({
          name: "report.reviewed",
          resourceType: "report",
          resourceId: "report-1",
          actorUserId: "reviewer-1",
          payload: { outcome: "REVIEWED" },
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: "author-1",
          type: NotificationType.REPORT_REVIEWED,
          reportId: "report-1",
        }),
      );
    });

    it("still uses REPORT_REVIEWED, distinct content, for CHANGES_REQUESTED", async () => {
      await service.processEvent(
        makeEvent({
          name: "report.reviewed",
          resourceType: "report",
          resourceId: "report-1",
          payload: { outcome: "CHANGES_REQUESTED" },
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.REPORT_REVIEWED,
          title: "Changes requested on your report",
        }),
      );
    });

    it("never notifies a reviewer about their own report", async () => {
      repository.getReport!.mockResolvedValue({
        title: "Daily report",
        authorId: "reviewer-1",
        departmentId: null,
      });
      await service.processEvent(
        makeEvent({
          name: "report.reviewed",
          resourceType: "report",
          resourceId: "report-1",
          actorUserId: "reviewer-1",
          payload: { outcome: "REVIEWED" },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });
  });

  describe("processEvent: todo.reminder", () => {
    it("notifies the todo's owner using the scheduler's own occurrence key", async () => {
      await service.processEvent(
        makeEvent({
          name: "todo.reminder",
          actorKind: OutboxActorKind.SYSTEM,
          actorUserId: null,
          resourceType: "todo",
          resourceId: "todo-1",
          payload: {
            occurrenceKey: "todo-1:2030-01-01T09:45:00.000Z:todo.reminder:v1",
          },
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: "owner-1",
          type: NotificationType.TODO_REMINDER,
          occurrenceKey: "todo-1:2030-01-01T09:45:00.000Z:todo.reminder:v1",
        }),
      );
    });

    it("skips a reminder for a todo already marked completed", async () => {
      repository.getTodo!.mockResolvedValue({
        title: "Confirm venue permits",
        userId: "owner-1",
        status: "COMPLETED",
      });
      await service.processEvent(
        makeEvent({
          name: "todo.reminder",
          resourceType: "todo",
          resourceId: "todo-1",
          payload: {
            occurrenceKey: "todo-1:2030-01-01T09:45:00.000Z:todo.reminder:v1",
          },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });

    it("respects a muted TODO_REMINDER preference", async () => {
      repository.isMuted!.mockResolvedValue(true);
      await service.processEvent(
        makeEvent({
          name: "todo.reminder",
          resourceType: "todo",
          resourceId: "todo-1",
          payload: {
            occurrenceKey: "todo-1:2030-01-01T09:45:00.000Z:todo.reminder:v1",
          },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });

    it("does nothing when the payload has no occurrenceKey or the todo no longer exists", async () => {
      await service.processEvent(
        makeEvent({ name: "todo.reminder", resourceType: "todo", payload: {} }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();

      repository.getTodo!.mockResolvedValue(null);
      await service.processEvent(
        makeEvent({
          name: "todo.reminder",
          resourceType: "todo",
          resourceId: "todo-1",
          payload: {
            occurrenceKey: "todo-1:2030-01-01T09:45:00.000Z:todo.reminder:v1",
          },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });
  });

  describe("processEvent: event.reminder", () => {
    it("notifies every resolved recipient using the scheduler's own occurrence key", async () => {
      repository.getEventReminderRecipientIds!.mockResolvedValue([
        "creator-1",
        "manager-1",
      ]);
      await service.processEvent(
        makeEvent({
          name: "event.reminder",
          actorKind: OutboxActorKind.SYSTEM,
          actorUserId: null,
          resourceType: "event",
          resourceId: "event-1",
          payload: {
            occurrenceKey: "event-1:2030-01-01T09:45:00.000Z:event.reminder:v1",
          },
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledTimes(2);
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: "creator-1",
          type: NotificationType.EVENT_REMINDER,
          eventId: "event-1",
        }),
      );
    });

    it("suppresses delayed event reminders once the event is terminal", async () => {
      repository.getEvent!.mockResolvedValue({
        name: "Autumn Product Launch",
        status: "CANCELLED",
      });
      await service.processEvent(
        makeEvent({
          name: "event.reminder",
          resourceType: "event",
          resourceId: "event-1",
          payload: {
            occurrenceKey: "event-1:2030-01-01T09:45:00.000Z:event.reminder:v1",
          },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });

    it("respects each recipient's own EVENT_REMINDER mute preference", async () => {
      repository.getEventReminderRecipientIds!.mockResolvedValue([
        "creator-1",
        "manager-1",
      ]);
      repository.isMuted!.mockImplementation(
        (userId: string) => userId === "manager-1",
      );
      await service.processEvent(
        makeEvent({
          name: "event.reminder",
          resourceType: "event",
          resourceId: "event-1",
          payload: {
            occurrenceKey: "event-1:2030-01-01T09:45:00.000Z:event.reminder:v1",
          },
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledTimes(1);
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({ recipientUserId: "creator-1" }),
      );
    });
  });

  describe("processEvent: report.reminder", () => {
    it("notifies the report's author using the scheduler's own occurrence key", async () => {
      await service.processEvent(
        makeEvent({
          name: "report.reminder",
          actorKind: OutboxActorKind.SYSTEM,
          actorUserId: null,
          resourceType: "report",
          resourceId: "report-1",
          payload: {
            occurrenceKey:
              "report-1:2030-01-01T00:00:00.000Z:report.reminder:v1",
          },
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: "author-1",
          type: NotificationType.REPORT_REMINDER,
          reportId: "report-1",
        }),
      );
    });

    it("skips a report that was submitted between claim and delivery", async () => {
      repository.getReport!.mockResolvedValue({
        title: "Daily report",
        authorId: "author-1",
        departmentId: null,
        status: "SUBMITTED",
      });
      await service.processEvent(
        makeEvent({
          name: "report.reminder",
          resourceType: "report",
          resourceId: "report-1",
          payload: {
            occurrenceKey:
              "report-1:2030-01-01T00:00:00.000Z:report.reminder:v1",
          },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });

    it("still reminds a report in CHANGES_REQUESTED", async () => {
      repository.getReport!.mockResolvedValue({
        title: "Daily report",
        authorId: "author-1",
        departmentId: null,
        status: "CHANGES_REQUESTED",
      });
      await service.processEvent(
        makeEvent({
          name: "report.reminder",
          resourceType: "report",
          resourceId: "report-1",
          payload: {
            occurrenceKey:
              "report-1:2030-01-01T00:00:00.000Z:report.reminder:v1",
          },
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.REPORT_REMINDER }),
      );
    });
  });

  describe("processEvent: partner.follow_up_due", () => {
    it("notifies the partner's owner using the scheduler's own occurrence key", async () => {
      await service.processEvent(
        makeEvent({
          name: "partner.follow_up_due",
          actorKind: OutboxActorKind.SYSTEM,
          actorUserId: null,
          resourceType: "partner",
          resourceId: "partner-1",
          payload: {
            occurrenceKey:
              "partner-1:2030-01-01T09:45:00.000Z:partner.follow_up_due:v1",
          },
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: "owner-1",
          type: NotificationType.PARTNER_FOLLOW_UP_DUE,
          partnerId: "partner-1",
        }),
      );
    });

    it("does nothing when the partner has no owner", async () => {
      repository.getPartner!.mockResolvedValue({
        organizationName: "Northbridge Media",
        ownerId: null,
        status: "PROSPECTIVE",
      });
      await service.processEvent(
        makeEvent({
          name: "partner.follow_up_due",
          resourceType: "partner",
          resourceId: "partner-1",
          payload: {
            occurrenceKey:
              "partner-1:2030-01-01T09:45:00.000Z:partner.follow_up_due:v1",
          },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });

    it("skips a relationship already Declined or Completed", async () => {
      repository.getPartner!.mockResolvedValue({
        organizationName: "Northbridge Media",
        ownerId: "owner-1",
        status: "DECLINED",
      });
      await service.processEvent(
        makeEvent({
          name: "partner.follow_up_due",
          resourceType: "partner",
          resourceId: "partner-1",
          payload: {
            occurrenceKey:
              "partner-1:2030-01-01T09:45:00.000Z:partner.follow_up_due:v1",
          },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });
  });

  describe("processEvent: letter.shared", () => {
    it("notifies a direct recipient, re-loaded from the share rather than the payload", async () => {
      await service.processEvent(
        makeEvent({
          name: "letter.shared",
          resourceType: "letter",
          resourceId: "letter-1",
          payload: { shareId: "share-1" },
        }),
      );
      expect(repository.getShare).toHaveBeenCalledWith("share-1");
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: "recipient-1",
          type: NotificationType.LETTER_SHARED,
          letterId: "letter-1",
        }),
      );
    });

    it("does nothing when the share has already been revoked", async () => {
      repository.getShare!.mockResolvedValue({
        recipientId: "recipient-1",
        allEmployees: false,
        revokedAt: new Date("2026-01-02T00:00:00.000Z"),
      });
      await service.processEvent(
        makeEvent({
          name: "letter.shared",
          resourceType: "letter",
          resourceId: "letter-1",
          payload: { shareId: "share-1" },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });

    it("skips the actor when they share with themselves", async () => {
      await service.processEvent(
        makeEvent({
          name: "letter.shared",
          actorUserId: "recipient-1",
          resourceType: "letter",
          resourceId: "letter-1",
          payload: { shareId: "share-1" },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });

    it("respects a mute on LETTER_SHARED", async () => {
      repository.isMuted!.mockResolvedValue(true);
      await service.processEvent(
        makeEvent({
          name: "letter.shared",
          resourceType: "letter",
          resourceId: "letter-1",
          payload: { shareId: "share-1" },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });

    it("pages through every active employee for an all-employees share", async () => {
      repository.getShare!.mockResolvedValue({
        recipientId: null,
        allEmployees: true,
        revokedAt: null,
      });
      repository
        .listActiveUserIds!.mockResolvedValueOnce(["user-1", "user-2"])
        .mockResolvedValueOnce([]);
      await service.processEvent(
        makeEvent({
          name: "letter.shared",
          resourceType: "letter",
          resourceId: "letter-1",
          payload: { shareId: "share-1" },
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledTimes(2);
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({ recipientUserId: "user-1" }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({ recipientUserId: "user-2" }),
      );
    });
  });

  describe("processEvent: document.shared", () => {
    it("notifies a direct recipient using the document's display name", async () => {
      await service.processEvent(
        makeEvent({
          name: "document.shared",
          resourceType: "document",
          resourceId: "document-1",
          payload: { shareId: "share-1" },
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: "recipient-1",
          type: NotificationType.DOCUMENT_SHARED,
          documentId: "document-1",
          body: "Vendor contract",
        }),
      );
    });
  });

  it("succeeds without creating a notification for an event name it does not understand", async () => {
    await service.processEvent(makeEvent({ name: "unknown.event" }));
    expect(repository.createIfAbsent).not.toHaveBeenCalled();
  });

  describe("processEvent: attendance.shift.assigned", () => {
    it("notifies the assigned employee using the shift's event name", async () => {
      await service.processEvent(
        makeEvent({
          name: "attendance.shift.assigned",
          resourceType: "event_shift",
          resourceId: "shift-1",
          payload: { employeeId: "employee-1" },
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: "employee-1",
          type: NotificationType.ATTENDANCE_SHIFT_ASSIGNED,
          body: "Launch Night",
        }),
      );
    });

    it("skips an assignment that no longer exists by the time it's delivered", async () => {
      repository.hasActiveShiftAssignment!.mockResolvedValue(false);
      await service.processEvent(
        makeEvent({
          name: "attendance.shift.assigned",
          resourceType: "event_shift",
          resourceId: "shift-1",
          payload: { employeeId: "employee-1" },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });

    it("skips an inactive employee", async () => {
      repository.isUserActive!.mockResolvedValue(false);
      await service.processEvent(
        makeEvent({
          name: "attendance.shift.assigned",
          resourceType: "event_shift",
          resourceId: "shift-1",
          payload: { employeeId: "employee-1" },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });
  });

  describe("processEvent: attendance.shift.schedule_changed", () => {
    it("notifies every employee currently assigned to the shift, excluding the actor", async () => {
      repository.getShiftAssignedEmployeeIds!.mockResolvedValue([
        "employee-1",
        "employee-2",
        ACTOR,
      ]);
      await service.processEvent(
        makeEvent({
          name: "attendance.shift.schedule_changed",
          resourceType: "event_shift",
          resourceId: "shift-1",
          payload: { changeType: "RESCHEDULE" },
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledTimes(2);
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: "employee-1",
          type: NotificationType.ATTENDANCE_SHIFT_SCHEDULE_CHANGED,
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({ recipientUserId: "employee-2" }),
      );
    });

    it("does nothing when the shift no longer exists", async () => {
      repository.getEventShift!.mockResolvedValue(null);
      await service.processEvent(
        makeEvent({
          name: "attendance.shift.schedule_changed",
          resourceType: "event_shift",
          resourceId: "shift-1",
          payload: { changeType: "CANCELLATION" },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });
  });

  describe("processEvent: attendance.overtime.decided", () => {
    it("notifies the employee when overtime is approved", async () => {
      await service.processEvent(
        makeEvent({
          name: "attendance.overtime.decided",
          resourceType: "attendance_overtime_approval",
          resourceId: "overtime-1",
          payload: { employeeId: "employee-1" },
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: "employee-1",
          type: NotificationType.ATTENDANCE_OVERTIME_DECIDED,
          title: "Overtime approved",
        }),
      );
    });

    it("notifies the employee when overtime is rejected", async () => {
      repository.getOvertimeApproval!.mockResolvedValue({
        status: "REJECTED",
        employeeId: "employee-1",
        sessionDate: new Date("2026-11-01T00:00:00Z"),
      });
      await service.processEvent(
        makeEvent({
          name: "attendance.overtime.decided",
          resourceType: "attendance_overtime_approval",
          resourceId: "overtime-1",
          payload: { employeeId: "employee-1" },
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Overtime rejected" }),
      );
    });

    it("skips an overtime review that is still pending", async () => {
      repository.getOvertimeApproval!.mockResolvedValue({
        status: "PENDING",
        employeeId: "employee-1",
        sessionDate: new Date("2026-11-01T00:00:00Z"),
      });
      await service.processEvent(
        makeEvent({
          name: "attendance.overtime.decided",
          resourceType: "attendance_overtime_approval",
          resourceId: "overtime-1",
          payload: { employeeId: "employee-1" },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });
  });

  describe("processEvent: attendance.exception.decided", () => {
    it("notifies the employee when an exception is approved", async () => {
      await service.processEvent(
        makeEvent({
          name: "attendance.exception.decided",
          resourceType: "attendance_exception",
          resourceId: "exception-1",
          payload: { employeeId: "employee-1" },
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: "employee-1",
          type: NotificationType.ATTENDANCE_EXCEPTION_DECIDED,
        }),
      );
    });

    it("skips an exception that is still pending", async () => {
      repository.getAttendanceException!.mockResolvedValue({
        status: "PENDING",
        employeeId: "employee-1",
        description: null,
      });
      await service.processEvent(
        makeEvent({
          name: "attendance.exception.decided",
          resourceType: "attendance_exception",
          resourceId: "exception-1",
          payload: { employeeId: "employee-1" },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });
  });

  describe("processEvent: leave.request.submitted", () => {
    it("notifies the employee's department manager", async () => {
      await service.processEvent(
        makeEvent({
          name: "leave.request.submitted",
          resourceType: "leave_request",
          resourceId: "request-1",
          payload: { employeeId: "employee-1" },
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: "manager-1",
          type: NotificationType.LEAVE_REQUEST_SUBMITTED,
          body: "Employee One",
        }),
      );
    });

    it("does nothing when the employee's department has no manager", async () => {
      repository.getDepartmentManagerId!.mockResolvedValue(null);
      await service.processEvent(
        makeEvent({
          name: "leave.request.submitted",
          resourceType: "leave_request",
          resourceId: "request-1",
          payload: { employeeId: "employee-1" },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });

    it("skips a request already decided by the time it's delivered", async () => {
      repository.getLeaveRequest!.mockResolvedValue({
        status: "APPROVED",
        employeeId: "employee-1",
        employeeName: "Employee One",
        employeeDepartmentId: "dept-1",
        leaveTypeName: "Annual",
      });
      await service.processEvent(
        makeEvent({
          name: "leave.request.submitted",
          resourceType: "leave_request",
          resourceId: "request-1",
          payload: { employeeId: "employee-1" },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });
  });

  describe("processEvent: leave.request.decided", () => {
    it("notifies the employee when their request is approved", async () => {
      repository.getLeaveRequest!.mockResolvedValue({
        status: "APPROVED",
        employeeId: "employee-1",
        employeeName: "Employee One",
        employeeDepartmentId: "dept-1",
        leaveTypeName: "Annual",
      });
      await service.processEvent(
        makeEvent({
          name: "leave.request.decided",
          resourceType: "leave_request",
          resourceId: "request-1",
          payload: { employeeId: "employee-1" },
        }),
      );
      expect(repository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: "employee-1",
          type: NotificationType.LEAVE_REQUEST_DECIDED,
          title: "Leave request approved",
        }),
      );
    });

    it("skips a request still pending", async () => {
      await service.processEvent(
        makeEvent({
          name: "leave.request.decided",
          resourceType: "leave_request",
          resourceId: "request-1",
          payload: { employeeId: "employee-1" },
        }),
      );
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });
  });
});
