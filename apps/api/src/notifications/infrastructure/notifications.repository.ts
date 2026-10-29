import { Injectable } from "@nestjs/common";

import {
  EventStatus,
  MeetingParticipantResponse,
  MeetingStatus,
  NotificationType,
  PartnerStatus,
  Prisma,
  ReportStatus,
  type PermissionScope,
  TodoStatus,
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
  expenseId: string | null;
  reportId: string | null;
  partnerId: string | null;
  letterId: string | null;
  documentId: string | null;
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
  expenseId: true,
  reportId: true,
  partnerId: true,
  letterId: true,
  documentId: true,
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
  expenseId?: string;
  reportId?: string;
  partnerId?: string;
  letterId?: string;
  documentId?: string;
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
    dismissedAt: null,
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
          ...(input.expenseId ? { expenseId: input.expenseId } : {}),
          ...(input.reportId ? { reportId: input.reportId } : {}),
          ...(input.partnerId ? { partnerId: input.partnerId } : {}),
          ...(input.letterId ? { letterId: input.letterId } : {}),
          ...(input.documentId ? { documentId: input.documentId } : {}),
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

  async dismiss(
    recipientUserId: string,
    id: string,
  ): Promise<NotificationRecord | null> {
    await this.db.notification.updateMany({
      where: { id, recipientUserId, dismissedAt: null },
      data: { dismissedAt: new Date() },
    });
    // Check ownership for repeated removals too, preserving the deduplication
    // record until normal retention cleanup.
    return this.db.notification.findFirst({
      where: { id, recipientUserId },
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

  async getExpense(expenseId: string): Promise<{
    eventId: string | null;
    description: string;
    createdById: string | null;
  } | null> {
    return this.db.expense.findUnique({
      where: { id: expenseId },
      select: { eventId: true, description: true, createdById: true },
    });
  }

  /** Every active user holding `permissionKey` at `scope` through their role -
   * resolved at process time (ADR 0003 §1), never a hardcoded role name, so
   * `expense.submitted` keeps notifying whoever the catalog grants
   * `expense.approve` to at ORGANIZATION scope (Super Admin today). */
  async getUsersWithGrant(
    permissionKey: string,
    scope: PermissionScope,
  ): Promise<string[]> {
    const rows = await this.db.userRoleAssignment.findMany({
      where: {
        role: { rolePermissions: { some: { permissionKey, scope } } },
        user: { status: UserAccountStatus.ACTIVE },
      },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  async getReport(reportId: string): Promise<{
    title: string;
    authorId: string;
    departmentId: string | null;
    status: ReportStatus;
  } | null> {
    return this.db.report.findUnique({
      where: { id: reportId },
      select: {
        title: true,
        authorId: true,
        departmentId: true,
        status: true,
      },
    });
  }

  /** Every active user who can review this report: holding `report.review`
   * at ORGANIZATION scope (anyone), or at DEPARTMENT scope within the
   * report's own department - resolved at process time (ADR 0003 §1), the
   * same per-user department comparison `ReportsService.visibility` already
   * performs for authorization, never a payload snapshot. */
  async getReportReviewerIds(departmentId: string | null): Promise<string[]> {
    const organization = await this.db.userRoleAssignment.findMany({
      where: {
        role: {
          rolePermissions: {
            some: { permissionKey: "report.review", scope: "ORGANIZATION" },
          },
        },
        user: { status: UserAccountStatus.ACTIVE },
      },
      select: { userId: true },
    });
    const department = departmentId
      ? await this.db.userRoleAssignment.findMany({
          where: {
            role: {
              rolePermissions: {
                some: { permissionKey: "report.review", scope: "DEPARTMENT" },
              },
            },
            user: { status: UserAccountStatus.ACTIVE, departmentId },
          },
          select: { userId: true },
        })
      : [];
    return [
      ...new Set([...organization, ...department].map((row) => row.userId)),
    ];
  }

  async getTodo(
    todoId: string,
  ): Promise<{ title: string; userId: string; status: TodoStatus } | null> {
    return this.db.todo.findUnique({
      where: { id: todoId },
      select: { title: true, userId: true, status: true },
    });
  }

  async getEvent(
    eventId: string,
  ): Promise<{ name: string; status: EventStatus } | null> {
    return this.db.event.findUnique({
      where: { id: eventId },
      select: { name: true, status: true },
    });
  }

  /** Creator + the connected workspace's manager (low-blast-radius default -
   * Event has no richer "all participants" roster suited for a mass-notify
   * reminder); deduped, filtered to active users. */
  async getEventReminderRecipientIds(eventId: string): Promise<string[]> {
    const event = await this.db.event.findUnique({
      where: { id: eventId },
      select: {
        createdById: true,
        workspace: { select: { managerId: true } },
      },
    });
    if (!event) return [];
    const candidates = [event.createdById, event.workspace.managerId].filter(
      (id): id is string => id !== null,
    );
    const ids = [...new Set(candidates)];
    if (ids.length === 0) return [];
    const active = await this.db.user.findMany({
      where: { id: { in: ids }, status: UserAccountStatus.ACTIVE },
      select: { id: true },
    });
    return active.map((user) => user.id);
  }

  async getPartner(partnerId: string): Promise<{
    organizationName: string;
    ownerId: string | null;
    status: PartnerStatus;
  } | null> {
    return this.db.partner.findUnique({
      where: { id: partnerId },
      select: { organizationName: true, ownerId: true, status: true },
    });
  }

  /** `deletedAt` is intentionally excluded from the select set: a letter
   * soft-deleted after being shared must still resolve a content string for
   * any notification already in flight, so this never 404s on its own -
   * the share's own `revokedAt` (re-checked by the caller) is what gates
   * delivery. */
  async getLetter(
    letterId: string,
  ): Promise<{ referenceNumber: string } | null> {
    return this.db.letter.findUnique({
      where: { id: letterId },
      select: { referenceNumber: true },
    });
  }

  async getDocument(
    documentId: string,
  ): Promise<{ displayName: string } | null> {
    return this.db.document.findUnique({
      where: { id: documentId },
      select: { displayName: true },
    });
  }

  /**
   * Re-loads the share that triggered `letter.shared`/`document.shared` -
   * the outbox payload only carries `shareId`, never trusting audience/scope
   * at the time the event was appended, since the share may have already
   * been revoked by the time this is delivered.
   */
  async getShare(shareId: string): Promise<{
    recipientId: string | null;
    allEmployees: boolean;
    revokedAt: Date | null;
  } | null> {
    return this.db.share.findUnique({
      where: { id: shareId },
      select: { recipientId: true, allEmployees: true, revokedAt: true },
    });
  }

  /**
   * One bounded page of active user ids, ordered by id for stable
   * keyset pagination - the all-employees share fan-out pages through this
   * rather than loading every active employee into memory at once.
   */
  async listActiveUserIds(
    afterId: string | null,
    limit: number,
  ): Promise<string[]> {
    const rows = await this.db.user.findMany({
      where: {
        status: UserAccountStatus.ACTIVE,
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: limit,
    });
    return rows.map((row) => row.id);
  }

  // -------------------------------------------------------------------
  // Attendance and leave (ATT-01/ATT-02)
  // -------------------------------------------------------------------

  async getEventShift(
    shiftId: string,
  ): Promise<{ eventName: string; status: string } | null> {
    const shift = await this.db.eventShift.findUnique({
      where: { id: shiftId },
      select: { status: true, event: { select: { name: true } } },
    });
    return shift ? { eventName: shift.event.name, status: shift.status } : null;
  }

  /** Re-verifies the assignment still exists before notifying - the
   * payload's `employeeId` is only a hint, never trusted on its own. */
  async hasActiveShiftAssignment(
    shiftId: string,
    employeeId: string,
  ): Promise<boolean> {
    const count = await this.db.eventShiftAssignment.count({
      where: { eventShiftId: shiftId, employeeId, unassignedAt: null },
    });
    return count === 1;
  }

  async getShiftAssignedEmployeeIds(shiftId: string): Promise<string[]> {
    const rows = await this.db.eventShiftAssignment.findMany({
      where: { eventShiftId: shiftId, unassignedAt: null },
      select: { employeeId: true },
    });
    return rows.map((row) => row.employeeId);
  }

  async getOvertimeApproval(id: string): Promise<{
    status: string;
    employeeId: string;
    sessionDate: Date;
  } | null> {
    const row = await this.db.attendanceOvertimeApproval.findUnique({
      where: { id },
      select: { status: true, session: { select: { employeeId: true, sessionDate: true } } },
    });
    return row
      ? { status: row.status, employeeId: row.session.employeeId, sessionDate: row.session.sessionDate }
      : null;
  }

  async getAttendanceException(id: string): Promise<{
    status: string;
    employeeId: string;
    description: string | null;
  } | null> {
    return this.db.attendanceException.findUnique({
      where: { id },
      select: { status: true, employeeId: true, description: true },
    });
  }

  async getLeaveRequest(id: string): Promise<{
    status: string;
    employeeId: string;
    employeeName: string | null;
    employeeDepartmentId: string | null;
    leaveTypeName: string;
  } | null> {
    const row = await this.db.leaveRequest.findUnique({
      where: { id },
      select: {
        status: true,
        employeeId: true,
        leaveType: { select: { name: true } },
        employee: {
          select: { firstName: true, lastName: true, email: true, departmentId: true },
        },
      },
    });
    if (!row) return null;
    const name = [row.employee.firstName, row.employee.lastName]
      .filter((part): part is string => Boolean(part))
      .join(" ");
    return {
      status: row.status,
      employeeId: row.employeeId,
      employeeName: name.length > 0 ? name : row.employee.email,
      employeeDepartmentId: row.employee.departmentId,
      leaveTypeName: row.leaveType.name,
    };
  }

  async getDepartmentManagerId(departmentId: string): Promise<string | null> {
    const department = await this.db.department.findUnique({
      where: { id: departmentId },
      select: { managerId: true },
    });
    return department?.managerId ?? null;
  }
}
