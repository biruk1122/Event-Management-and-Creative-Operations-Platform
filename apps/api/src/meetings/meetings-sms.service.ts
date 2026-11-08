import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { ENVIRONMENT, type Environment } from "../config/environment.js";
import { DatabaseService } from "../database/database.service.js";
import { AuditWriterService } from "../audit/audit-writer.service.js";
import {
  AuditActorKind,
  AuditOutcome,
  MeetingParticipantResponse,
  MeetingStatus,
  type Prisma,
} from "../generated/prisma/client.js";
import { formatSmsDateTime, smsPersonName } from "../sms/sms-format.js";
import type { DispatchView } from "../sms/sms.repository.js";
import { SmsService } from "../sms/sms.service.js";
import { smsTitle } from "../sms/templates.js";

const SCAN_INTERVAL_MS = 60_000;
/** Meetings per reminder scan page. Pages continue across scans. */
export const MEETING_SCAN_PAGE_SIZE = 200;

interface MeetingSnapshot {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
  location: string | null;
}

/** Plain-text parameters shared by every meeting template. Long text is shortened. */
function meetingParams(
  meeting: Omit<MeetingSnapshot, "id">,
): Record<string, string> {
  return {
    meeting_title: smsTitle(meeting.title),
    start_time: formatSmsDateTime(meeting.startAt),
    end_time: formatSmsDateTime(meeting.endAt),
    location: smsTitle(meeting.location?.trim() ?? "") || "not set",
  };
}

/**
 * Meeting SMS. Invitations are queued in the transaction that adds a
 * participant. Change notices are queued in the transaction that changes the
 * start time, end time or location. Reminders come from a scan.
 *
 * Every message is keyed to one meeting and one recipient, and reminders and
 * change notices also to the start time they describe. Send-time checks stop
 * a message if the meeting is no longer scheduled, the person is no longer a
 * participant, or the start time has changed since the message was queued.
 *
 * Each SMS step runs in a savepoint of its business transaction, so an SMS
 * failure never undoes the business change.
 */
@Injectable()
export class MeetingsSmsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MeetingsSmsService.name);
  private timer: NodeJS.Timeout | null = null;
  private scanning = false;
  /** Where the reminder scan continues from. Undefined means the next scan starts at the beginning. */
  private reminderCursor: string | undefined;

  constructor(
    @Inject(ENVIRONMENT) private readonly environment: Environment,
    private readonly db: DatabaseService,
    private readonly sms: SmsService,
    private readonly audit: AuditWriterService,
  ) {}

  onModuleInit(): void {
    this.sms.registerPrecondition("MEETING_INVITATION", (message) =>
      this.check(message, false),
    );
    this.sms.registerPrecondition("MEETING_CHANGED", (message) =>
      this.check(message, false),
    );
    this.sms.registerPrecondition("MEETING_REMINDER", (message) =>
      this.check(message, true),
    );
    this.sms.registerPrecondition("MEETING_CANCELLED", (message) =>
      this.checkCancelled(message),
    );
    if (!this.environment.AFROMESSAGE_ENABLED) return;
    this.timer = setInterval(() => {
      void this.scan(new Date());
    }, SCAN_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Queues the invitation for one newly added participant, in the caller's transaction. */
  async enqueueInvitation(
    tx: Prisma.TransactionClient,
    input: MeetingSnapshot & {
      userId: string;
      organizerId: string;
      requestId: string;
    },
  ): Promise<void> {
    await this.sms.isolate(
      tx,
      "meeting invitation",
      async () => {
        const recipient = await tx.user.findUnique({
          where: { id: input.userId },
          select: { phone: true, firstName: true, lastName: true },
        });
        await this.sms.enqueue(tx, {
          category: "MEETING_INVITATION",
          idempotencyKey: `meeting.invitation:${input.id}:${input.userId}:${input.startAt.toISOString()}`,
          recipientUserId: input.userId,
          recipientPhone: recipient?.phone,
          template: "MEETING_INVITATION",
          params: {
            employee_name: smsPersonName(recipient, "there"),
            ...meetingParams(input),
          },
          sourceType: "meeting",
          sourceId: input.id,
          sourceDueAt: input.startAt,
          actorKind: "USER",
          actorUserId: input.organizerId,
          requestId: input.requestId,
        });
      },
      (error) =>
        this.recordFailure(
          tx,
          input.id,
          "MEETING_INVITATION",
          input.requestId,
          error,
        ),
    );
  }

  /**
   * Queues a change notice for each current participant who should hear about
   * the change. Declined participants are included: the change is still part of
   * the meeting they were invited to. Each recipient is isolated on its own, so
   * one failure does not stop the others.
   */
  async enqueueChanged(
    tx: Prisma.TransactionClient,
    input: MeetingSnapshot & {
      changedAt: Date;
      organizerId: string;
      requestId: string;
    },
  ): Promise<void> {
    await this.queueForParticipants(tx, input, {
      category: "MEETING_CHANGED",
      template: "MEETING_CHANGED",
      keyPrefix: `meeting.changed:${input.changedAt.getTime()}`,
      label: "meeting change",
      startAtMatters: true,
    });
  }

  /**
   * Queues a cancellation notice for each current participant, in the caller's
   * transaction. The cancellation commits whether or not this succeeds.
   */
  async enqueueCancelled(
    tx: Prisma.TransactionClient,
    input: MeetingSnapshot & {
      organizerId: string;
      requestId: string;
    },
  ): Promise<void> {
    await this.queueForParticipants(tx, input, {
      category: "MEETING_CANCELLED",
      template: "MEETING_CANCELLED",
      keyPrefix: "meeting.cancelled",
      label: "meeting cancellation",
      startAtMatters: false,
    });
  }

  /**
   * Queues one message per current participant. Each recipient is isolated on
   * its own, so one failure does not stop the others.
   */
  private async queueForParticipants(
    tx: Prisma.TransactionClient,
    meeting: MeetingSnapshot & { organizerId: string; requestId: string },
    options: {
      category: "MEETING_CHANGED" | "MEETING_CANCELLED";
      template: "MEETING_CHANGED" | "MEETING_CANCELLED";
      keyPrefix: string;
      label: string;
      /** Whether the message is only valid for the start time it was written with. */
      startAtMatters: boolean;
    },
  ): Promise<void> {
    const participants = await tx.meetingParticipant.findMany({
      where: { meetingId: meeting.id },
      select: { userId: true, user: { select: { phone: true } } },
    });
    for (const participant of participants) {
      await this.sms.isolate(
        tx,
        options.label,
        async () => {
          await this.sms.enqueue(tx, {
            category: options.category,
            idempotencyKey: `${options.keyPrefix}:${meeting.id}:${participant.userId}`,
            recipientUserId: participant.userId,
            recipientPhone: participant.user.phone,
            template: options.template,
            params: meetingParams(meeting),
            sourceType: "meeting",
            sourceId: meeting.id,
            sourceDueAt: options.startAtMatters ? meeting.startAt : null,
            actorKind: "USER",
            actorUserId: meeting.organizerId,
            requestId: meeting.requestId,
          });
        },
        (error) =>
          this.recordFailure(
            tx,
            meeting.id,
            options.category,
            meeting.requestId,
            error,
          ),
      );
    }
  }

  /**
   * Leaves a durable audit record of an SMS that could not be queued. The
   * business change still commits. Invitations and change notices are not
   * retried automatically, so this record is their only trace. Message text
   * and phone numbers are not recorded.
   */
  private async recordFailure(
    tx: Prisma.TransactionClient,
    meetingId: string,
    category: string,
    requestId: string | undefined,
    error: unknown,
  ): Promise<void> {
    const reason = error instanceof Error ? error.message : "unknown error";
    await this.audit.append(tx, {
      action: "sms.enqueue_failed",
      actorKind: AuditActorKind.SYSTEM,
      ...(requestId ? { requestId } : {}),
      resourceType: "meeting",
      resourceId: meetingId,
      outcome: AuditOutcome.FAILED,
      metadata: { category, reason: reason.slice(0, 200) },
    });
  }

  /**
   * One reminder scan. It pages through scheduled meetings that start within
   * the reminder lead time and queues one reminder per participant who was
   * added at least that long before the start. Participants added inside the
   * window get no reminder, so nothing is sent late.
   */
  async scan(now: Date): Promise<number> {
    if (!this.environment.AFROMESSAGE_ENABLED || this.scanning) return 0;
    this.scanning = true;
    let queued = 0;
    try {
      const soon = new Date(now.getTime() + this.leadMs());
      const page = await this.db.meeting.findMany({
        where: {
          status: MeetingStatus.SCHEDULED,
          startAt: { gt: now, lte: soon },
          ...(this.reminderCursor ? { id: { gt: this.reminderCursor } } : {}),
        },
        orderBy: { id: "asc" },
        select: {
          id: true,
          title: true,
          startAt: true,
          endAt: true,
          location: true,
          participants: {
            where: {
              response: { not: MeetingParticipantResponse.DECLINED },
            },
            select: { userId: true, createdAt: true },
          },
        },
        take: MEETING_SCAN_PAGE_SIZE,
      });
      for (const meeting of page) {
        queued += await this.queueReminders(meeting);
      }
      this.reminderCursor =
        page.length < MEETING_SCAN_PAGE_SIZE
          ? undefined
          : page[page.length - 1]!.id;
    } catch (error) {
      this.logger.error(
        `meeting SMS scan failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      this.scanning = false;
    }
    return queued;
  }

  private leadMs(): number {
    return this.environment.MEETING_REMINDER_MINUTES * 60_000;
  }

  private async queueReminders(meeting: {
    id: string;
    title: string;
    startAt: Date;
    endAt: Date;
    location: string | null;
    participants: { userId: string; createdAt: Date }[];
  }): Promise<number> {
    const latestAddition = meeting.startAt.getTime() - this.leadMs();
    let queued = 0;
    for (const participant of meeting.participants) {
      // Added inside the lead time: no reminder, so nothing is sent late.
      if (participant.createdAt.getTime() > latestAddition) continue;
      const outcome = await this.db.$transaction((tx) =>
        this.sms.isolate(tx, "meeting reminder", async () => {
          const recipient = await tx.user.findUnique({
            where: { id: participant.userId },
            select: { phone: true },
          });
          return this.sms.enqueue(tx, {
            category: "MEETING_REMINDER",
            idempotencyKey: `meeting.reminder:${meeting.id}:${participant.userId}:${meeting.startAt.toISOString()}`,
            recipientUserId: participant.userId,
            recipientPhone: recipient?.phone,
            template: "MEETING_REMINDER",
            params: meetingParams(meeting),
            sourceType: "meeting",
            sourceId: meeting.id,
            sourceDueAt: meeting.startAt,
            actorKind: "SYSTEM",
          });
        }),
      );
      if (outcome?.kind === "QUEUED") queued += 1;
    }
    return queued;
  }

  /**
   * Send-time rule for meeting messages. The meeting must still exist and be
   * scheduled, the recipient must still be a participant, and the start time must
   * be the one the message was written for. Reminders also skip participants who
   * declined since the reminder was queued.
   */
  private async check(
    message: DispatchView,
    isReminder: boolean,
  ): Promise<string | null> {
    if (!message.sourceId) return "MEETING_REMOVED";
    const meeting = await this.db.meeting.findUnique({
      where: { id: message.sourceId },
      select: { status: true, startAt: true },
    });
    if (!meeting) return "MEETING_REMOVED";
    if (meeting.status !== MeetingStatus.SCHEDULED)
      return "MEETING_NOT_SCHEDULED";
    if (!message.recipientUserId) return "PARTICIPANT_REMOVED";
    const participant = await this.db.meetingParticipant.findUnique({
      where: {
        meetingId_userId: {
          meetingId: message.sourceId,
          userId: message.recipientUserId,
        },
      },
      select: { response: true },
    });
    if (!participant) return "PARTICIPANT_REMOVED";
    if (
      isReminder &&
      participant.response === MeetingParticipantResponse.DECLINED
    )
      return "PARTICIPANT_DECLINED";
    const scheduled = message.sourceDueAt?.getTime() ?? null;
    if (scheduled === null || scheduled !== meeting.startAt.getTime())
      return "START_CHANGED";
    return null;
  }

  /**
   * Send-time rule for cancellation notices. The meeting must still be
   * cancelled, and the recipient must still be a participant. A cancellation
   * cannot be undone or rescheduled, so no start-time check applies.
   */
  private async checkCancelled(message: DispatchView): Promise<string | null> {
    if (!message.sourceId) return "MEETING_REMOVED";
    const meeting = await this.db.meeting.findUnique({
      where: { id: message.sourceId },
      select: { status: true },
    });
    if (!meeting) return "MEETING_REMOVED";
    if (meeting.status !== MeetingStatus.CANCELLED)
      return "MEETING_NOT_CANCELLED";
    if (!message.recipientUserId) return "PARTICIPANT_REMOVED";
    const participant = await this.db.meetingParticipant.findUnique({
      where: {
        meetingId_userId: {
          meetingId: message.sourceId,
          userId: message.recipientUserId,
        },
      },
      select: { userId: true },
    });
    return participant ? null : "PARTICIPANT_REMOVED";
  }
}
