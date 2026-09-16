import { Injectable } from "@nestjs/common";

import { NotificationType } from "../generated/prisma/client.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { roomName } from "../realtime/realtime.contracts.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import type { ClaimedOutboxDelivery } from "../outbox/outbox.types.js";
import type { ListNotificationsQueryDto } from "./dto/list-notifications-query.dto.js";
import {
  notificationNotFound,
  notificationTypeInvalid,
  notificationTypeNotMutable,
} from "./notifications.errors.js";
import type {
  NotificationFeedResponse,
  NotificationInvalidatedPayload,
  NotificationPreferencesResponse,
  NotificationResponse,
  UnreadCountResponse,
} from "./notifications.contracts.js";
import {
  isMutableNotificationType,
  MUTABLE_NOTIFICATION_TYPES,
  messageMentionContent,
  newMessageContent,
  previewText,
  taskApprovedContent,
  taskAssignedContent,
  taskRejectedContent,
} from "./notifications.policy.js";
import {
  NotificationsRepository,
  type CreateNotificationInput,
  type NotificationRecord,
} from "./infrastructure/notifications.repository.js";

type OutboxEventEnvelope = ClaimedOutboxDelivery["event"];

@Injectable()
export class NotificationsService {
  constructor(
    private readonly repository: NotificationsRepository,
    private readonly permissions: PermissionsService,
    private readonly realtime: RealtimeService,
  ) {}

  private async assertSelfGrant(actingUserId: string): Promise<void> {
    const allowed = await this.permissions.hasGrant(
      actingUserId,
      "notification.read",
      "SELF",
    );
    if (!allowed) throw permissionDenied();
  }

  async listFeed(
    actingUserId: string,
    query: ListNotificationsQueryDto,
  ): Promise<NotificationFeedResponse> {
    await this.assertSelfGrant(actingUserId);
    const { items, nextCursor } = await this.repository.listFeed(
      actingUserId,
      query.cursor,
      query.limit,
    );
    return { items: items.map(toNotificationResponse), nextCursor };
  }

  async unreadCount(actingUserId: string): Promise<UnreadCountResponse> {
    await this.assertSelfGrant(actingUserId);
    return { unreadCount: await this.repository.unreadCount(actingUserId) };
  }

  async markRead(
    actingUserId: string,
    id: string,
  ): Promise<NotificationResponse> {
    await this.assertSelfGrant(actingUserId);
    const result = await this.repository.markRead(actingUserId, id);
    if (result === "not_found") throw notificationNotFound();
    return toNotificationResponse(result);
  }

  async listPreferences(
    actingUserId: string,
  ): Promise<NotificationPreferencesResponse> {
    await this.assertSelfGrant(actingUserId);
    const muted = new Set(await this.repository.listMutedTypes(actingUserId));
    return {
      items: MUTABLE_NOTIFICATION_TYPES.map((type) => ({
        type,
        muted: muted.has(type),
      })),
    };
  }

  async setPreference(
    actingUserId: string,
    type: string,
    muted: boolean,
  ): Promise<void> {
    await this.assertSelfGrant(actingUserId);
    if (!isNotificationType(type)) throw notificationTypeInvalid();
    if (!isMutableNotificationType(type)) throw notificationTypeNotMutable();
    await this.repository.setMuted(actingUserId, type, muted);
  }

  /**
   * The `notifications` outbox consumer (ADR 0001 §3-4; ADR 0004 §6):
   * resolves recipients from current state, not a payload snapshot, creates
   * the per-recipient `Notification` row(s) idempotently, and publishes the
   * advisory real-time invalidation. Called by the relay for every claimed
   * delivery; any error here leaves the delivery `PENDING` for retry.
   */
  async processEvent(event: OutboxEventEnvelope): Promise<void> {
    switch (event.name) {
      case "task.assigned":
        await this.processTaskAssigned(event);
        return;
      case "task.reviewed":
        await this.processTaskReviewed(event);
        return;
      case "discuss.message.created":
        await this.processMessageCreated(event);
        return;
      default:
        // An event name this consumer version does not understand: succeed
        // without creating a notification rather than retrying forever.
        return;
    }
  }

  private async processTaskAssigned(event: OutboxEventEnvelope): Promise<void> {
    const payload = event.payload as { assigneeUserId?: string } | null;
    const assigneeUserId = payload?.assigneeUserId;
    if (!assigneeUserId || !event.resourceId) return;
    const task = await this.repository.getTask(event.resourceId);
    if (!task) return;
    const content = taskAssignedContent(task.title);
    await this.createAndPublish({
      recipientUserId: assigneeUserId,
      type: NotificationType.TASK_ASSIGNED,
      sourceEventId: event.id,
      occurrenceKey: event.id,
      title: content.title,
      body: content.body,
      taskId: event.resourceId,
    });
  }

  private async processTaskReviewed(event: OutboxEventEnvelope): Promise<void> {
    const payload = event.payload as { outcome?: string } | null;
    const outcome = payload?.outcome;
    if (
      !event.resourceId ||
      (outcome !== "APPROVED" && outcome !== "CHANGES_REQUESTED")
    ) {
      return;
    }
    const task = await this.repository.getTask(event.resourceId);
    if (!task) return;
    const recipientIds = await this.repository.getTaskAssigneeIds(
      event.resourceId,
      event.actorUserId ?? undefined,
    );
    const type =
      outcome === "APPROVED"
        ? NotificationType.TASK_APPROVED
        : NotificationType.TASK_REJECTED;
    const content =
      outcome === "APPROVED"
        ? taskApprovedContent(task.title)
        : taskRejectedContent(task.title);
    for (const recipientUserId of recipientIds) {
      await this.createAndPublish({
        recipientUserId,
        type,
        sourceEventId: event.id,
        occurrenceKey: event.id,
        title: content.title,
        body: content.body,
        taskId: event.resourceId,
      });
    }
  }

  private async processMessageCreated(
    event: OutboxEventEnvelope,
  ): Promise<void> {
    if (!event.resourceId) return;
    const message = await this.repository.getMessage(event.resourceId);
    if (!message) return;
    const preview = previewText(message.content);

    const memberIds = await this.repository.getConversationMemberIds(
      message.conversationId,
      message.authorId ?? undefined,
    );
    const newMessage = newMessageContent(preview);
    for (const recipientUserId of memberIds) {
      const muted = await this.repository.isMuted(
        recipientUserId,
        NotificationType.NEW_MESSAGE,
      );
      if (muted) continue;
      await this.createAndPublish({
        recipientUserId,
        type: NotificationType.NEW_MESSAGE,
        sourceEventId: event.id,
        occurrenceKey: event.id,
        title: newMessage.title,
        body: newMessage.body,
        messageId: event.resourceId,
      });
    }

    const mentionIds = await this.repository.getMessageMentionUserIds(
      event.resourceId,
    );
    const mention = messageMentionContent(preview);
    for (const recipientUserId of mentionIds) {
      if (recipientUserId === message.authorId) continue;
      await this.createAndPublish({
        recipientUserId,
        type: NotificationType.MESSAGE_MENTION,
        sourceEventId: event.id,
        occurrenceKey: event.id,
        title: mention.title,
        body: mention.body,
        messageId: event.resourceId,
      });
    }
  }

  private async createAndPublish(
    input: CreateNotificationInput,
  ): Promise<void> {
    const result = await this.repository.createIfAbsent(input);
    if (result === "duplicate") return;
    this.realtime.publish<NotificationInvalidatedPayload>(
      roomName("user", input.recipientUserId),
      "notification.invalidated",
      1,
      { notificationId: result.id, type: result.type },
    );
  }
}

function isNotificationType(value: string): value is NotificationType {
  return (Object.values(NotificationType) as string[]).includes(value);
}

function toNotificationResponse(
  record: NotificationRecord,
): NotificationResponse {
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    body: record.body,
    taskId: record.taskId,
    messageId: record.messageId,
    eventId: record.eventId,
    createdAt: record.createdAt.toISOString(),
    readAt: record.readAt?.toISOString() ?? null,
  };
}
