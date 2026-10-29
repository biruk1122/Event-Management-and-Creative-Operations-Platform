import { Injectable } from "@nestjs/common";

import {
  EventStatus,
  MeetingStatus,
  NotificationType,
  PartnerStatus,
  ReportStatus,
  TodoStatus,
} from "../generated/prisma/client.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { roomName } from "../realtime/realtime.contracts.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import type {
  AttendanceExceptionDecidedEventPayload,
  AttendanceOvertimeDecidedEventPayload,
  AttendanceShiftAssignedEventPayload,
  ClaimedOutboxDelivery,
  DocumentSharedEventPayload,
  EventReminderEventPayload,
  LeaveRequestDecidedEventPayload,
  LeaveRequestSubmittedEventPayload,
  LetterSharedEventPayload,
  MeetingParticipantInvitedEventPayload,
  MeetingReminderEventPayload,
  PartnerFollowUpDueEventPayload,
  ReportReminderEventPayload,
  TodoReminderEventPayload,
} from "../outbox/outbox.types.js";
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
  attendanceExceptionApprovedContent,
  attendanceExceptionRejectedContent,
  attendanceOvertimeApprovedContent,
  attendanceOvertimeRejectedContent,
  attendanceShiftAssignedContent,
  attendanceShiftScheduleChangedContent,
  documentSharedContent,
  eventReminderContent,
  expenseApprovedContent,
  expenseRejectedContent,
  expenseSubmittedContent,
  leaveRequestApprovedContent,
  leaveRequestRejectedContent,
  leaveRequestReturnedContent,
  leaveRequestSubmittedContent,
  letterSharedContent,
  messageMentionContent,
  meetingInvitationContent,
  meetingReminderContent,
  newMessageContent,
  partnerFollowUpDueContent,
  previewText,
  reportChangesRequestedContent,
  reportReminderContent,
  reportReviewedContent,
  reportSubmittedContent,
  taskApprovedContent,
  taskAssignedContent,
  taskDueContent,
  taskOverdueContent,
  taskRejectedContent,
  todoReminderContent,
  type NotificationContent,
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

  async remove(actingUserId: string, id: string): Promise<void> {
    await this.assertSelfGrant(actingUserId);
    const notification = await this.repository.dismiss(actingUserId, id);
    if (!notification) throw notificationNotFound();
    this.realtime.publish<NotificationInvalidatedPayload>(
      roomName("user", actingUserId),
      "notification.invalidated",
      1,
      { notificationId: notification.id, type: notification.type },
    );
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
      case "meeting.participant.invited":
        await this.processMeetingInvitation(event);
        return;
      case "meeting.reminder":
        await this.processMeetingReminder(event);
        return;
      case "task.due":
        await this.processScheduledTaskReminder(
          event,
          NotificationType.TASK_DUE,
          taskDueContent,
        );
        return;
      case "task.overdue":
        await this.processScheduledTaskReminder(
          event,
          NotificationType.TASK_OVERDUE,
          taskOverdueContent,
        );
        return;
      case "expense.submitted":
        await this.processExpenseSubmitted(event);
        return;
      case "expense.reviewed":
        await this.processExpenseReviewed(event);
        return;
      case "report.submitted":
        await this.processReportSubmitted(event);
        return;
      case "report.reviewed":
        await this.processReportReviewed(event);
        return;
      case "todo.reminder":
        await this.processTodoReminder(event);
        return;
      case "event.reminder":
        await this.processEventReminder(event);
        return;
      case "report.reminder":
        await this.processReportReminder(event);
        return;
      case "partner.follow_up_due":
        await this.processPartnerFollowUpDue(event);
        return;
      case "letter.shared":
        await this.processLetterShared(event);
        return;
      case "document.shared":
        await this.processDocumentShared(event);
        return;
      case "attendance.shift.assigned":
        await this.processAttendanceShiftAssigned(event);
        return;
      case "attendance.shift.schedule_changed":
        await this.processAttendanceShiftScheduleChanged(event);
        return;
      case "attendance.overtime.decided":
        await this.processAttendanceOvertimeDecided(event);
        return;
      case "attendance.exception.decided":
        await this.processAttendanceExceptionDecided(event);
        return;
      case "leave.request.submitted":
        await this.processLeaveRequestSubmitted(event);
        return;
      case "leave.request.decided":
        await this.processLeaveRequestDecided(event);
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
    // ADR 0003 §2: "each newly assigned active user other than the actor" -
    // a self-assignment must not notify the assigner about their own action.
    if (assigneeUserId === event.actorUserId) return;
    if (!(await this.repository.isUserActive(assigneeUserId))) return;
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

  private async processMeetingInvitation(
    event: OutboxEventEnvelope,
  ): Promise<void> {
    const payload =
      event.payload as Partial<MeetingParticipantInvitedEventPayload> | null;
    const participantUserId = payload?.participantUserId;
    if (!event.resourceId || !participantUserId) return;
    if (participantUserId === event.actorUserId) return;
    if (!(await this.repository.isUserActive(participantUserId))) return;
    if (
      !(await this.repository.isMeetingParticipant(
        event.resourceId,
        participantUserId,
      ))
    ) {
      return;
    }
    const meeting = await this.repository.getMeeting(event.resourceId);
    if (!meeting || meeting.status !== MeetingStatus.SCHEDULED) return;
    const content = meetingInvitationContent(meeting.title);
    await this.createAndPublish({
      recipientUserId: participantUserId,
      type: NotificationType.MEETING_INVITATION,
      sourceEventId: event.id,
      occurrenceKey: event.id,
      title: content.title,
      body: content.body,
      meetingId: event.resourceId,
    });
  }

  private async processMeetingReminder(
    event: OutboxEventEnvelope,
  ): Promise<void> {
    const payload =
      event.payload as Partial<MeetingReminderEventPayload> | null;
    if (!event.resourceId || !payload?.occurrenceKey) return;
    const meeting = await this.repository.getMeeting(event.resourceId);
    if (!meeting || meeting.status !== MeetingStatus.SCHEDULED) return;
    const recipientIds = await this.repository.getMeetingReminderRecipientIds(
      event.resourceId,
    );
    const content = meetingReminderContent(meeting.title);
    for (const recipientUserId of recipientIds) {
      if (
        await this.repository.isMuted(
          recipientUserId,
          NotificationType.MEETING_REMINDER,
        )
      )
        continue;
      await this.createAndPublish({
        recipientUserId,
        type: NotificationType.MEETING_REMINDER,
        sourceEventId: event.id,
        occurrenceKey: payload.occurrenceKey,
        title: content.title,
        body: content.body,
        meetingId: event.resourceId,
      });
    }
  }

  /**
   * TASK_DUE/TASK_OVERDUE (ADR 0003 §2): scheduled, no actor to exclude.
   * Unlike the immediate producers, `occurrenceKey` comes from the payload -
   * the scheduler already computed the deterministic
   * `resourceId + exact UTC instant + rule/version` key ADR 0003 §3
   * requires for a scheduled producer, distinct from an immediate
   * producer's `occurrenceKey = eventId`. Both types are mutable (ADR 0003
   * §4), so a recipient's mute preference is checked before creating.
   */
  private async processScheduledTaskReminder(
    event: OutboxEventEnvelope,
    type: NotificationType,
    contentFor: (taskTitle: string) => NotificationContent,
  ): Promise<void> {
    const payload = event.payload as { occurrenceKey?: string } | null;
    const occurrenceKey = payload?.occurrenceKey;
    if (!occurrenceKey || !event.resourceId) return;
    const task = await this.repository.getTask(event.resourceId);
    if (!task) return;
    const recipientIds = await this.repository.getTaskAssigneeIds(
      event.resourceId,
    );
    const content = contentFor(task.title);
    for (const recipientUserId of recipientIds) {
      const muted = await this.repository.isMuted(recipientUserId, type);
      if (muted) continue;
      await this.createAndPublish({
        recipientUserId,
        type,
        sourceEventId: event.id,
        occurrenceKey,
        title: content.title,
        body: content.body,
        taskId: event.resourceId,
      });
    }
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

  /** Every active user holding `expense.approve` at ORGANIZATION scope
   * (Super Admin only, by design) is notified - resolved through the grant
   * system at process time, not a hardcoded role name. */
  private async processExpenseSubmitted(
    event: OutboxEventEnvelope,
  ): Promise<void> {
    if (!event.resourceId) return;
    const expense = await this.repository.getExpense(event.resourceId);
    if (!expense) return;
    const recipientIds = await this.repository.getUsersWithGrant(
      "expense.approve",
      "ORGANIZATION",
    );
    const content = expenseSubmittedContent(expense.description);
    for (const recipientUserId of recipientIds) {
      if (recipientUserId === event.actorUserId) continue;
      await this.createAndPublish({
        recipientUserId,
        type: NotificationType.EXPENSE_SUBMITTED,
        sourceEventId: event.id,
        occurrenceKey: event.id,
        title: content.title,
        body: content.body,
        expenseId: event.resourceId,
      });
    }
  }

  private async processExpenseReviewed(
    event: OutboxEventEnvelope,
  ): Promise<void> {
    const payload = event.payload as { outcome?: string } | null;
    const outcome = payload?.outcome;
    if (
      !event.resourceId ||
      (outcome !== "APPROVED" && outcome !== "REJECTED")
    ) {
      return;
    }
    const expense = await this.repository.getExpense(event.resourceId);
    if (!expense?.createdById || expense.createdById === event.actorUserId) {
      return;
    }
    const content =
      outcome === "APPROVED"
        ? expenseApprovedContent(expense.description)
        : expenseRejectedContent(expense.description);
    await this.createAndPublish({
      recipientUserId: expense.createdById,
      type: NotificationType.EXPENSE_REVIEWED,
      sourceEventId: event.id,
      occurrenceKey: event.id,
      title: content.title,
      body: content.body,
      expenseId: event.resourceId,
    });
  }

  /** Every active user who can review this report is notified: holding
   * `report.review` at ORGANIZATION scope, or at DEPARTMENT scope within
   * the report's own department (resolved at process time, mirroring
   * `ReportsService.visibility`'s own per-user department comparison). */
  private async processReportSubmitted(
    event: OutboxEventEnvelope,
  ): Promise<void> {
    if (!event.resourceId) return;
    const report = await this.repository.getReport(event.resourceId);
    if (!report) return;
    const recipientIds = await this.repository.getReportReviewerIds(
      report.departmentId,
    );
    const content = reportSubmittedContent(report.title);
    for (const recipientUserId of recipientIds) {
      if (recipientUserId === event.actorUserId) continue;
      await this.createAndPublish({
        recipientUserId,
        type: NotificationType.REPORT_SUBMITTED,
        sourceEventId: event.id,
        occurrenceKey: event.id,
        title: content.title,
        body: content.body,
        reportId: event.resourceId,
      });
    }
  }

  private async processReportReviewed(
    event: OutboxEventEnvelope,
  ): Promise<void> {
    const payload = event.payload as { outcome?: string } | null;
    const outcome = payload?.outcome;
    if (
      !event.resourceId ||
      (outcome !== "REVIEWED" && outcome !== "CHANGES_REQUESTED")
    ) {
      return;
    }
    const report = await this.repository.getReport(event.resourceId);
    if (!report || report.authorId === event.actorUserId) return;
    const content =
      outcome === "REVIEWED"
        ? reportReviewedContent(report.title)
        : reportChangesRequestedContent(report.title);
    await this.createAndPublish({
      recipientUserId: report.authorId,
      type: NotificationType.REPORT_REVIEWED,
      sourceEventId: event.id,
      occurrenceKey: event.id,
      title: content.title,
      body: content.body,
      reportId: event.resourceId,
    });
  }

  /** TODO_REMINDER: re-loads the to-do (never trusts the payload), skips a
   * reminder for work already marked done (the one terminal state a Todo
   * has), mute-checks its owner. No `todoId` target column exists -
   * `notificationHref` already deep-links `TODO_REMINDER` to `/todos`. */
  private async processTodoReminder(event: OutboxEventEnvelope): Promise<void> {
    const payload = event.payload as Partial<TodoReminderEventPayload> | null;
    if (!event.resourceId || !payload?.occurrenceKey) return;
    const todo = await this.repository.getTodo(event.resourceId);
    if (!todo || todo.status === TodoStatus.COMPLETED) return;
    if (
      await this.repository.isMuted(todo.userId, NotificationType.TODO_REMINDER)
    )
      return;
    const content = todoReminderContent(todo.title);
    await this.createAndPublish({
      recipientUserId: todo.userId,
      type: NotificationType.TODO_REMINDER,
      sourceEventId: event.id,
      occurrenceKey: payload.occurrenceKey,
      title: content.title,
      body: content.body,
    });
  }

  /** EVENT_REMINDER: re-loads the event, skips a terminal (Completed/
   * Cancelled) event, notifies the creator and the connected workspace's
   * manager (deduped, active-only), each mute-checked individually. */
  private async processEventReminder(
    event: OutboxEventEnvelope,
  ): Promise<void> {
    const payload = event.payload as Partial<EventReminderEventPayload> | null;
    if (!event.resourceId || !payload?.occurrenceKey) return;
    const record = await this.repository.getEvent(event.resourceId);
    if (
      !record ||
      record.status === EventStatus.COMPLETED ||
      record.status === EventStatus.CANCELLED
    )
      return;
    const recipientIds = await this.repository.getEventReminderRecipientIds(
      event.resourceId,
    );
    const content = eventReminderContent(record.name);
    for (const recipientUserId of recipientIds) {
      if (
        await this.repository.isMuted(
          recipientUserId,
          NotificationType.EVENT_REMINDER,
        )
      )
        continue;
      await this.createAndPublish({
        recipientUserId,
        type: NotificationType.EVENT_REMINDER,
        sourceEventId: event.id,
        occurrenceKey: payload.occurrenceKey,
        title: content.title,
        body: content.body,
        eventId: event.resourceId,
      });
    }
  }

  /** REPORT_REMINDER: re-loads the report, skips one no longer open (the
   * author may have submitted between claim and delivery), notifies the
   * author, reusing the existing `reportId` target column. */
  private async processReportReminder(
    event: OutboxEventEnvelope,
  ): Promise<void> {
    const payload = event.payload as Partial<ReportReminderEventPayload> | null;
    if (!event.resourceId || !payload?.occurrenceKey) return;
    const report = await this.repository.getReport(event.resourceId);
    if (
      !report ||
      (report.status !== ReportStatus.DRAFT &&
        report.status !== ReportStatus.CHANGES_REQUESTED)
    )
      return;
    if (
      await this.repository.isMuted(
        report.authorId,
        NotificationType.REPORT_REMINDER,
      )
    )
      return;
    const content = reportReminderContent(report.title);
    await this.createAndPublish({
      recipientUserId: report.authorId,
      type: NotificationType.REPORT_REMINDER,
      sourceEventId: event.id,
      occurrenceKey: payload.occurrenceKey,
      title: content.title,
      body: content.body,
      reportId: event.resourceId,
    });
  }

  /** PARTNER_FOLLOW_UP_DUE: re-loads the partner, skips a terminal
   * (Declined/Completed) relationship and one with no owner (no one to
   * notify is a valid terminal outcome, matching `expense.reviewed` with no
   * `createdById`), notifies the owner. */
  private async processPartnerFollowUpDue(
    event: OutboxEventEnvelope,
  ): Promise<void> {
    const payload =
      event.payload as Partial<PartnerFollowUpDueEventPayload> | null;
    if (!event.resourceId || !payload?.occurrenceKey) return;
    const partner = await this.repository.getPartner(event.resourceId);
    if (
      !partner ||
      !partner.ownerId ||
      partner.status === PartnerStatus.DECLINED ||
      partner.status === PartnerStatus.COMPLETED
    )
      return;
    if (
      await this.repository.isMuted(
        partner.ownerId,
        NotificationType.PARTNER_FOLLOW_UP_DUE,
      )
    )
      return;
    const content = partnerFollowUpDueContent(partner.organizationName);
    await this.createAndPublish({
      recipientUserId: partner.ownerId,
      type: NotificationType.PARTNER_FOLLOW_UP_DUE,
      sourceEventId: event.id,
      occurrenceKey: payload.occurrenceKey,
      title: content.title,
      body: content.body,
      partnerId: event.resourceId,
    });
  }

  /** LETTER_SHARED: re-loads the `Share` by `shareId` (never trusts the
   * payload's audience) and skips if it was revoked before delivery. */
  private async processLetterShared(event: OutboxEventEnvelope): Promise<void> {
    const payload = event.payload as Partial<LetterSharedEventPayload> | null;
    if (!event.resourceId || !payload?.shareId) return;
    const share = await this.repository.getShare(payload.shareId);
    if (!share || share.revokedAt !== null) return;
    const letter = await this.repository.getLetter(event.resourceId);
    if (!letter) return;
    const content = letterSharedContent(letter.referenceNumber);
    await this.notifyShareAudience({
      event,
      share,
      type: NotificationType.LETTER_SHARED,
      content,
      target: { letterId: event.resourceId },
    });
  }

  /** DOCUMENT_SHARED: same contract as `processLetterShared`, for documents. */
  private async processDocumentShared(
    event: OutboxEventEnvelope,
  ): Promise<void> {
    const payload = event.payload as Partial<DocumentSharedEventPayload> | null;
    if (!event.resourceId || !payload?.shareId) return;
    const share = await this.repository.getShare(payload.shareId);
    if (!share || share.revokedAt !== null) return;
    const document = await this.repository.getDocument(event.resourceId);
    if (!document) return;
    const content = documentSharedContent(document.displayName);
    await this.notifyShareAudience({
      event,
      share,
      type: NotificationType.DOCUMENT_SHARED,
      content,
      target: { documentId: event.resourceId },
    });
  }

  /**
   * Notifies a share's audience: a single direct recipient, or every
   * currently-active employee for an all-employees share, paged through in
   * bounded batches (never one unbounded query/loop over the whole
   * workforce). `createAndPublish`'s own `(recipientUserId, type,
   * occurrenceKey)` uniqueness makes a re-walk after a crash mid-fan-out
   * safe: already-notified recipients are skipped as duplicates.
   */
  private async notifyShareAudience(input: {
    event: OutboxEventEnvelope;
    share: { recipientId: string | null; allEmployees: boolean };
    type:
      | typeof NotificationType.LETTER_SHARED
      | typeof NotificationType.DOCUMENT_SHARED;
    content: NotificationContent;
    target: { letterId: string } | { documentId: string };
  }): Promise<void> {
    const { event, share, type, content, target } = input;
    const notifyOne = async (recipientUserId: string) => {
      if (recipientUserId === event.actorUserId) return;
      if (await this.repository.isMuted(recipientUserId, type)) return;
      await this.createAndPublish({
        recipientUserId,
        type,
        sourceEventId: event.id,
        occurrenceKey: event.id,
        title: content.title,
        body: content.body,
        ...target,
      });
    };

    if (share.recipientId) {
      await notifyOne(share.recipientId);
      return;
    }
    if (!share.allEmployees) return;

    const BATCH_SIZE = 200;
    let afterId: string | null = null;
    for (;;) {
      const ids = await this.repository.listActiveUserIds(afterId, BATCH_SIZE);
      if (ids.length === 0) break;
      for (const id of ids) {
        await notifyOne(id);
      }
      afterId = ids[ids.length - 1]!;
      if (ids.length < BATCH_SIZE) break;
    }
  }

  private async processMessageCreated(
    event: OutboxEventEnvelope,
  ): Promise<void> {
    if (!event.resourceId) return;
    const message = await this.repository.getMessage(event.resourceId);
    if (!message) return;
    const preview = previewText(message.content);

    // Fetched once, including the author, so mentions can be checked against
    // current membership below - a mention is never notified on its own.
    const memberIds = await this.repository.getConversationMemberIds(
      message.conversationId,
    );
    const memberSet = new Set(memberIds);
    const newMessage = newMessageContent(preview);
    for (const recipientUserId of memberIds) {
      if (recipientUserId === message.authorId) continue;
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
      // ADR 0003 §1: a target must resolve through an approved module
      // relation - a mention naming someone outside the conversation must
      // never surface a preview of content they have no REST access to.
      if (!memberSet.has(recipientUserId)) continue;
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

  /** ATTENDANCE_SHIFT_ASSIGNED: re-verifies the assignment still exists and
   * the employee is still active before notifying - the payload's
   * `employeeId` is only a hint. */
  private async processAttendanceShiftAssigned(
    event: OutboxEventEnvelope,
  ): Promise<void> {
    const payload =
      event.payload as Partial<AttendanceShiftAssignedEventPayload> | null;
    if (!event.resourceId || !payload?.employeeId) return;
    if (payload.employeeId === event.actorUserId) return;
    if (!(await this.repository.isUserActive(payload.employeeId))) return;
    if (
      !(await this.repository.hasActiveShiftAssignment(
        event.resourceId,
        payload.employeeId,
      ))
    ) {
      return;
    }
    const shift = await this.repository.getEventShift(event.resourceId);
    if (!shift) return;
    const content = attendanceShiftAssignedContent(shift.eventName);
    await this.createAndPublish({
      recipientUserId: payload.employeeId,
      type: NotificationType.ATTENDANCE_SHIFT_ASSIGNED,
      sourceEventId: event.id,
      occurrenceKey: event.id,
      title: content.title,
      body: content.body,
    });
  }

  /** ATTENDANCE_SHIFT_SCHEDULE_CHANGED: no recipient hint in the payload -
   * resolves every employee currently assigned to the shift live, since a
   * reschedule/cancellation/reinstatement affects whoever is assigned at
   * delivery time. */
  private async processAttendanceShiftScheduleChanged(
    event: OutboxEventEnvelope,
  ): Promise<void> {
    if (!event.resourceId) return;
    const shift = await this.repository.getEventShift(event.resourceId);
    if (!shift) return;
    const recipientIds = await this.repository.getShiftAssignedEmployeeIds(
      event.resourceId,
    );
    const content = attendanceShiftScheduleChangedContent(shift.eventName);
    for (const recipientUserId of recipientIds) {
      if (recipientUserId === event.actorUserId) continue;
      await this.createAndPublish({
        recipientUserId,
        type: NotificationType.ATTENDANCE_SHIFT_SCHEDULE_CHANGED,
        sourceEventId: event.id,
        occurrenceKey: event.id,
        title: content.title,
        body: content.body,
      });
    }
  }

  /** ATTENDANCE_OVERTIME_DECIDED: re-loads the approval, skips one no
   * longer in a decided state (re-decided or reverted between claim and
   * delivery is not expected, but never trust the snapshot). */
  private async processAttendanceOvertimeDecided(
    event: OutboxEventEnvelope,
  ): Promise<void> {
    const payload =
      event.payload as Partial<AttendanceOvertimeDecidedEventPayload> | null;
    if (!event.resourceId || !payload?.employeeId) return;
    const overtime = await this.repository.getOvertimeApproval(
      event.resourceId,
    );
    if (
      !overtime ||
      (overtime.status !== "APPROVED" && overtime.status !== "REJECTED")
    ) {
      return;
    }
    const sessionDate = overtime.sessionDate.toISOString().slice(0, 10);
    const content =
      overtime.status === "APPROVED"
        ? attendanceOvertimeApprovedContent(sessionDate)
        : attendanceOvertimeRejectedContent(sessionDate);
    await this.createAndPublish({
      recipientUserId: overtime.employeeId,
      type: NotificationType.ATTENDANCE_OVERTIME_DECIDED,
      sourceEventId: event.id,
      occurrenceKey: event.id,
      title: content.title,
      body: content.body,
    });
  }

  /** ATTENDANCE_EXCEPTION_DECIDED: same contract as overtime decisions. */
  private async processAttendanceExceptionDecided(
    event: OutboxEventEnvelope,
  ): Promise<void> {
    const payload =
      event.payload as Partial<AttendanceExceptionDecidedEventPayload> | null;
    if (!event.resourceId || !payload?.employeeId) return;
    const exception = await this.repository.getAttendanceException(
      event.resourceId,
    );
    if (
      !exception ||
      (exception.status !== "APPROVED" && exception.status !== "REJECTED")
    ) {
      return;
    }
    const content =
      exception.status === "APPROVED"
        ? attendanceExceptionApprovedContent(
            exception.description ?? "Attendance exception",
          )
        : attendanceExceptionRejectedContent(
            exception.description ?? "Attendance exception",
          );
    await this.createAndPublish({
      recipientUserId: exception.employeeId,
      type: NotificationType.ATTENDANCE_EXCEPTION_DECIDED,
      sourceEventId: event.id,
      occurrenceKey: event.id,
      title: content.title,
      body: content.body,
    });
  }

  /** LEAVE_REQUEST_SUBMITTED: notifies the employee's department manager -
   * resolved live from `Department.managerId`, never from the payload. No
   * manager assigned is a valid terminal outcome (matches
   * `partner.follow_up_due` with no owner), not an error. */
  private async processLeaveRequestSubmitted(
    event: OutboxEventEnvelope,
  ): Promise<void> {
    const payload =
      event.payload as Partial<LeaveRequestSubmittedEventPayload> | null;
    if (!event.resourceId || !payload?.employeeId) return;
    const request = await this.repository.getLeaveRequest(event.resourceId);
    if (!request || request.status !== "PENDING") return;
    if (!request.employeeDepartmentId) return;
    const managerId = await this.repository.getDepartmentManagerId(
      request.employeeDepartmentId,
    );
    if (!managerId || managerId === request.employeeId) return;
    const content = leaveRequestSubmittedContent(
      request.employeeName ?? "An employee",
    );
    await this.createAndPublish({
      recipientUserId: managerId,
      type: NotificationType.LEAVE_REQUEST_SUBMITTED,
      sourceEventId: event.id,
      occurrenceKey: event.id,
      title: content.title,
      body: content.body,
    });
  }

  /** LEAVE_REQUEST_DECIDED: notifies the employee of the outcome. */
  private async processLeaveRequestDecided(
    event: OutboxEventEnvelope,
  ): Promise<void> {
    const payload =
      event.payload as Partial<LeaveRequestDecidedEventPayload> | null;
    if (!event.resourceId || !payload?.employeeId) return;
    const request = await this.repository.getLeaveRequest(event.resourceId);
    if (!request) return;
    const content =
      request.status === "APPROVED"
        ? leaveRequestApprovedContent(request.leaveTypeName)
        : request.status === "REJECTED"
          ? leaveRequestRejectedContent(request.leaveTypeName)
          : request.status === "RETURNED_FOR_CHANGES"
            ? leaveRequestReturnedContent(request.leaveTypeName)
            : null;
    if (!content) return;
    await this.createAndPublish({
      recipientUserId: request.employeeId,
      type: NotificationType.LEAVE_REQUEST_DECIDED,
      sourceEventId: event.id,
      occurrenceKey: event.id,
      title: content.title,
      body: content.body,
    });
  }

  private async createAndPublish(
    input: CreateNotificationInput,
  ): Promise<void> {
    const result = await this.repository.createIfAbsent(input);
    if (result === "duplicate") return;
    // ADR 0004 §2: the envelope's `eventId` must be the originating internal
    // domain event's id, not this notification's own id - so a multi-
    // recipient fan-out (e.g. task.reviewed) still lets a client correlate
    // every resulting frame back to the same domain event.
    this.realtime.publish<NotificationInvalidatedPayload>(
      roomName("user", input.recipientUserId),
      "notification.invalidated",
      1,
      { notificationId: result.id, type: result.type },
      input.sourceEventId,
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
    meetingId: record.meetingId,
    expenseId: record.expenseId,
    reportId: record.reportId,
    partnerId: record.partnerId,
    letterId: record.letterId,
    documentId: record.documentId,
    createdAt: record.createdAt.toISOString(),
    readAt: record.readAt?.toISOString() ?? null,
  };
}
