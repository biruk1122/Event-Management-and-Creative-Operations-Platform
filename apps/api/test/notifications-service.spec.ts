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
      listMutedTypes: vi.fn().mockResolvedValue([]),
      setMuted: vi.fn().mockResolvedValue(undefined),
      getTask: vi.fn().mockResolvedValue({
        title: "Confirm venue permits",
        workspaceId: null,
      }),
      getTaskAssigneeIds: vi.fn().mockResolvedValue([]),
      getMessage: vi.fn().mockResolvedValue({
        conversationId: "conversation-1",
        authorId: "author-1",
        content: "hello",
      }),
      getConversationMemberIds: vi.fn().mockResolvedValue([]),
      getMessageMentionUserIds: vi.fn().mockResolvedValue([]),
    };
    permissions = { hasGrant: vi.fn().mockResolvedValue(true) };
    realtime = { publish: vi.fn() };
    service = new NotificationsService(
      repository as never,
      permissions as never,
      realtime as never,
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

  it("lists only the seven mutable types with the caller's mute state", async () => {
    repository.listMutedTypes!.mockResolvedValue([
      NotificationType.NEW_MESSAGE,
    ]);
    const result = await service.listPreferences(ACTOR);
    expect(result.items).toHaveLength(7);
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
      expect(realtime.publish).toHaveBeenCalledWith(
        "user:assignee-1",
        "notification.invalidated",
        1,
        expect.objectContaining({ notificationId: "created-1" }),
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
  });

  it("succeeds without creating a notification for an event name it does not understand", async () => {
    await service.processEvent(makeEvent({ name: "unknown.event" }));
    expect(repository.createIfAbsent).not.toHaveBeenCalled();
  });
});
