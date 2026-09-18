import { Injectable } from "@nestjs/common";

import {
  MeetingParticipantResponse,
  MeetingStatus,
  NotificationType,
  Prisma,
  UserAccountStatus,
} from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

const PRISMA_ERROR = { uniqueViolation: "P2002" } as const;

function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

export interface NotificationRecord {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  taskId: string | null;
  messageId: string | null;
  eventId: string | null;
  meetingId: string | null;
  createdAt: Date;
  readAt: Date | null;
}

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  taskId: true,
  messageId: true,
  eventId: true,
  meetingId: true,
  createdAt: true,
  readAt: true,
} as const;

export interface CreateNotificationInput {
  recipientUserId: string;
  type: NotificationType;
  sourceEventId: string;
  occurrenceKey: string;
  title: string;
  body: string;
  taskId?: string;
  messageId?: string;
  eventId?: string;
  meetingId?: string;
}

interface FeedCursor {
  createdAt: Date;
  id: string;
}

function visibleToRecipient(
  recipientUserId: string,
): Prisma.NotificationWhereInput {
  return {
    recipientUserId,
    OR: [
      { meetingId: null },
      {
        meeting: {
          OR: [
            { organizerId: recipientUserId },
            { participants: { some: { userId: recipientUserId } } },
          ],
        },
      },
    ],
  };
}

function encodeCursor(cursor: FeedCursor): string {
  return Buffer.from(
    `${cursor.createdAt.toISOString()}|${cursor.id}`,
    "utf8",
  ).toString("base64url");
}

function decodeCursor(value: string): FeedCursor | null {
  try {
    const [iso, id] = Buffer.from(value, "base64url")
      .toString("utf8")
      .split("|");
    if (!iso || !id) return null;
    const createdAt = new Date(iso);
    return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id };
  } catch {
    return null;
  }
}

@Injectable()
export class NotificationsRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Idempotent per `(recipientUserId, type, occurrenceKey)` (ADR 0003 §3): a
   * unique-constraint conflict means another delivery attempt already
   * created this exact notification, and is a successful no-op here, not an
   * error.
   */
  async createIfAbsent(
    input: CreateNotificationInput,
  ): Promise<NotificationRecord | "duplicate"> {
    try {
      return await this.db.notification.create({
        data: {
          recipientUserId: input.recipientUserId,
          type: input.type,
          sourceEventId: input.sourceEventId,
          occurrenceKey: input.occurrenceKey,
          title: input.title,
          body: input.body,
          ...(input.taskId ? { taskId: input.taskId } : {}),
          ...(input.messageId ? { messageId: input.messageId } : {}),
          ...(input.eventId ? { eventId: input.eventId } : {}),
          ...(input.meetingId ? { meetingId: input.meetingId } : {}),
        },
        select: NOTIFICATION_SELECT,
      });
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.uniqueViolation))
        return "duplicate";
      throw error;
    }
  }

  async isMuted(userId: string, type: NotificationType): Promise<boolean> {
    const count = await this.db.notificationPreference.count({
      where: { userId, type },
    });
    return count === 1;
  }

  async listFeed(
    recipientUserId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ items: NotificationRecord[]; nextCursor: string | null }> {
    const decoded = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.db.notification.findMany({
      where: {
        AND: [
          visibleToRecipient(recipientUserId),
          ...(decoded
            ? [
                {
                  OR: [
                    { createdAt: { lt: decoded.createdAt } },
                    { createdAt: decoded.createdAt, id: { lt: decoded.id } },
                  ],
                } satisfies Prisma.NotificationWhereInput,
              ]
            : []),
        ],
      },
      select: NOTIFICATION_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  async unreadCount(recipientUserId: string): Promise<number> {
    return this.db.notification.count({
      where: { AND: [visibleToRecipient(recipientUserId), { readAt: null }] },
    });
  }

  /** Marking an already-read notification read again is a stable no-op, not
   * an error - only an unknown or someone-else's id is `not_found`. */
  async markRead(
    recipientUserId: string,
    id: string,
  ): Promise<NotificationRecord | "not_found"> {
    const updated = await this.db.notification.updateMany({
      where: {
        AND: [visibleToRecipient(recipientUserId), { id, readAt: null }],
      },
      data: { readAt: new Date() },
    });
    if (updated.count === 0) {
      const existing = await this.db.notification.findFirst({
        where: { AND: [visibleToRecipient(recipientUserId), { id }] },
        select: NOTIFICATION_SELECT,
      });
      return existing ?? "not_found";
    }
    return this.db.notification.findUniqueOrThrow({
      where: { id },
      select: NOTIFICATION_SELECT,
    });
  }

  async listMutedTypes(userId: string): Promise<NotificationType[]> {
    const rows = await this.db.notificationPreference.findMany({
      where: { userId },
      select: { type: true },
    });
    return rows.map((row) => row.type);
  }

  async setMuted(
    userId: string,
    type: NotificationType,
    muted: boolean,
  ): Promise<void> {
    if (muted) {
      await this.db.notificationPreference.upsert({
        where: { userId_type: { userId, type } },
        create: { userId, type },
        update: {},
      });
    } else {
      await this.db.notificationPreference.deleteMany({
        where: { userId, type },
      });
    }
  }

  // --- Recipient/content resolution for the `notifications` outbox consumer
  // (ADR 0003 §1: resolve through the owning module's relation, not a
  // payload snapshot). These are minimal, read-only projections of tables
  // owned by Tasks/Discuss - the Prisma schema is already shared globally
  // across every module, and `RealtimeService` reads another module's
  // repository the same way for its own room authorization.

  async getTask(
    taskId: string,
  ): Promise<{ title: string; workspaceId: string | null } | null> {
    return this.db.task.findUnique({
      where: { id: taskId },
      select: { title: true, workspaceId: true },
    });
  }

  async getMeeting(
    meetingId: string,
  ): Promise<{ title: string; status: MeetingStatus } | null> {
    return this.db.meeting.findUnique({
      where: { id: meetingId },
      select: { title: true, status: true },
    });
  }

  async isMeetingParticipant(
    meetingId: string,
    userId: string,
  ): Promise<boolean> {
    return (
      (await this.db.meetingParticipant.count({
        where: { meetingId, userId },
      })) === 1
    );
  }

  async getMeetingReminderRecipientIds(meetingId: string): Promise<string[]> {
    const rows = await this.db.meetingParticipant.findMany({
      where: {
        meetingId,
        response: {
          in: [
            MeetingParticipantResponse.PENDING,
            MeetingParticipantResponse.ACCEPTED,
          ],
        },
        user: { status: UserAccountStatus.ACTIVE },
      },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  /** ADR 0003 §1/§2: a recipient must be an active user at creation time. */
  async isUserActive(userId: string): Promise<boolean> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    return user?.status === UserAccountStatus.ACTIVE;
  }

  async getTaskAssigneeIds(
    taskId: string,
    excludeUserId?: string,
  ): Promise<string[]> {
    const rows = await this.db.taskAssignment.findMany({
      where: {
        taskId,
        ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
        user: { status: UserAccountStatus.ACTIVE },
      },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  async getMessage(messageId: string): Promise<{
    conversationId: string;
    authorId: string | null;
    content: string;
  } | null> {
    return this.db.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true, authorId: true, content: true },
    });
  }

  async getConversationMemberIds(
    conversationId: string,
    excludeUserId?: string,
  ): Promise<string[]> {
    const rows = await this.db.conversationMember.findMany({
      where: {
        conversationId,
        ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
        user: { status: UserAccountStatus.ACTIVE },
      },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  async getMessageMentionUserIds(messageId: string): Promise<string[]> {
    const rows = await this.db.messageMention.findMany({
      where: { messageId, user: { status: UserAccountStatus.ACTIVE } },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }
}
