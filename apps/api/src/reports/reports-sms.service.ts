import { Injectable, type OnModuleInit } from "@nestjs/common";

import { DatabaseService } from "../database/database.service.js";
import { AuditWriterService } from "../audit/audit-writer.service.js";
import {
  AuditActorKind,
  AuditOutcome,
  ReportStatus,
  UserAccountStatus,
  type Prisma,
} from "../generated/prisma/client.js";
import { normalizeEthiopianPhone } from "../sms/phone.js";
import { smsPersonName } from "../sms/sms-format.js";
import type { DispatchView } from "../sms/sms.repository.js";
import { SmsService } from "../sms/sms.service.js";
import { smsTitle } from "../sms/templates.js";

/** The roles that review submitted reports. Matched by name, as the task module does. */
const REVIEW_ROLE_NAMES = ["Super Admin", "Admin"];

/** Active users holding a system Super Admin or Admin role. */
function activeReviewerWhere(): Prisma.UserWhereInput {
  return {
    status: UserAccountStatus.ACTIVE,
    roleAssignment: {
      role: { isSystem: true, name: { in: REVIEW_ROLE_NAMES } },
    },
  };
}

interface SmsRecipient {
  id: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
}

/**
 * Report SMS: the submission notice. When a report is submitted, every active
 * Super Admin and Admin is texted, plus the designated recipient if there is
 * one. Legacy reports without a designated recipient still reach the admins.
 *
 * Recipients are excluded when they are inactive, when their number is missing
 * or invalid, or when they are the report's author. Each recipient's message is
 * queued in its own savepoint in the submission transaction, so a failure never
 * blocks the submission or the in-app notifications. Each message is keyed to
 * the report, the recipient and the submission time, so a repeated call
 * queues nothing new. At send time a message is cancelled if the report is no
 * longer pending for that submission, or the recipient is no longer eligible.
 */
@Injectable()
export class ReportsSmsService implements OnModuleInit {
  constructor(
    private readonly db: DatabaseService,
    private readonly sms: SmsService,
    private readonly audit: AuditWriterService,
  ) {}

  onModuleInit(): void {
    this.sms.registerPrecondition("REPORT_SUBMITTED", (message) =>
      this.checkSubmitted(message),
    );
  }

  /**
   * Queues the submission notices for one submission, in the caller's
   * transaction. Returns nothing: a failure is isolated and audited.
   */
  async enqueueSubmitted(
    tx: Prisma.TransactionClient,
    input: {
      reportId: string;
      designatedRecipientId: string | null;
      actorUserId: string;
      submittedAt: Date | null;
      requestId: string;
    },
  ): Promise<void> {
    if (!input.submittedAt) return;
    const submittedAt = input.submittedAt;
    await this.sms.isolate(
      tx,
      "report submitted",
      async () => {
        const report = await tx.report.findUniqueOrThrow({
          where: { id: input.reportId },
          select: {
            title: true,
            authorId: true,
            author: { select: { firstName: true, lastName: true } },
          },
        });
        const recipients = await this.submissionRecipients(
          tx,
          report.authorId,
          input.designatedRecipientId,
        );
        for (const recipient of recipients) {
          await this.sms.isolate(
            tx,
            "report submitted recipient",
            async () => {
              await this.sms.enqueue(tx, {
                category: "REPORT_SUBMITTED",
                idempotencyKey: `report.submitted:${input.reportId}:${recipient.id}:${submittedAt.toISOString()}`,
                recipientUserId: recipient.id,
                recipientPhone: recipient.phone,
                template: "REPORT_SUBMITTED",
                params: {
                  employee_name: smsPersonName(recipient, "there"),
                  report_title: smsTitle(report.title),
                  author_name: smsPersonName(report.author, "A team member"),
                },
                sourceType: "report",
                sourceId: input.reportId,
                sourceDueAt: submittedAt,
                actorKind: "USER",
                actorUserId: input.actorUserId,
                requestId: input.requestId,
              });
            },
            (error) =>
              this.recordFailure(tx, input.reportId, input.requestId, error),
          );
        }
      },
      (error) => this.recordFailure(tx, input.reportId, input.requestId, error),
    );
  }

  /**
   * The people texted about a submission: active Super Admins and Admins and
   * the designated recipient, deduplicated, without the author, and only those
   * with a valid Ethiopian mobile number.
   */
  private async submissionRecipients(
    tx: Prisma.TransactionClient,
    authorId: string,
    designatedRecipientId: string | null,
  ): Promise<SmsRecipient[]> {
    const select = {
      id: true,
      phone: true,
      firstName: true,
      lastName: true,
    } as const;
    const reviewers = await tx.user.findMany({
      where: { AND: [activeReviewerWhere(), { id: { not: authorId } }] },
      select,
    });
    const designated =
      designatedRecipientId && designatedRecipientId !== authorId
        ? await tx.user.findFirst({
            where: {
              id: designatedRecipientId,
              status: UserAccountStatus.ACTIVE,
            },
            select,
          })
        : null;
    const byId = new Map<string, SmsRecipient>();
    for (const user of [...reviewers, ...(designated ? [designated] : [])]) {
      byId.set(user.id, user);
    }
    return [...byId.values()].filter(
      (user) => normalizeEthiopianPhone(user.phone).ok,
    );
  }

  /**
   * Leaves a durable audit record of a submission notice that could not be
   * queued. The submission still commits. The message text and phone numbers are not recorded.
   */
  private async recordFailure(
    tx: Prisma.TransactionClient,
    reportId: string,
    requestId: string | undefined,
    error: unknown,
  ): Promise<void> {
    const reason = error instanceof Error ? error.message : "unknown error";
    await this.audit.append(tx, {
      action: "sms.enqueue_failed",
      actorKind: AuditActorKind.SYSTEM,
      ...(requestId ? { requestId } : {}),
      resourceType: "report",
      resourceId: reportId,
      outcome: AuditOutcome.FAILED,
      metadata: { category: "REPORT_SUBMITTED", reason: reason.slice(0, 200) },
    });
  }

  /**
   * Send-time rule. The report must still be pending from this submission, and
   * the recipient must still be the designated recipient or an active reviewer,
   * and not the author.
   */
  private async checkSubmitted(message: DispatchView): Promise<string | null> {
    if (!message.sourceId) return "REPORT_REMOVED";
    const report = await this.db.report.findUnique({
      where: { id: message.sourceId },
      select: {
        status: true,
        authorId: true,
        reportToId: true,
        submittedAt: true,
      },
    });
    if (!report) return "REPORT_REMOVED";
    if (
      report.status !== ReportStatus.SUBMITTED &&
      report.status !== ReportStatus.UNDER_REVIEW
    )
      return "REPORT_NOT_PENDING";
    const scheduled = message.sourceDueAt?.getTime() ?? null;
    if (
      report.submittedAt === null ||
      scheduled === null ||
      report.submittedAt.getTime() !== scheduled
    )
      return "SUBMISSION_SUPERSEDED";
    const recipient = message.recipientUserId;
    if (!recipient || recipient === report.authorId)
      return "RECIPIENT_NOT_ELIGIBLE";
    if (recipient === report.reportToId) return null;
    const reviewer = await this.db.user.findFirst({
      where: { AND: [{ id: recipient }, activeReviewerWhere()] },
      select: { id: true },
    });
    return reviewer ? null : "RECIPIENT_NOT_ELIGIBLE";
  }
}
