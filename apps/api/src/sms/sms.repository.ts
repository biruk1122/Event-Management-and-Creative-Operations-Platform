import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service.js";
import type {
  Prisma,
  SmsCategory as DbSmsCategory,
  SmsMessageStatus,
} from "../generated/prisma/client.js";
import type { SendOutcome, SmsCategory, SmsStatus } from "./sms.types.js";

export interface NewSmsMessage {
  idempotencyKey: string;
  category: SmsCategory;
  recipientUserId: string | null;
  recipientPhone: string | null;
  body: string;
  templateKey: string;
  sourceType: string | null;
  sourceId: string | null;
  status: "PENDING" | "SKIPPED";
  skipReason: string | null;
  /** For reminders: the due date the message was scheduled for. */
  sourceDueAt: Date | null;
}

export interface DispatchView {
  id: string;
  status: SmsMessageStatus;
  category: DbSmsCategory;
  recipientUserId: string | null;
  recipientPhone: string | null;
  body: string;
  sourceType: string | null;
  sourceId: string | null;
  sourceDueAt: Date | null;
}

export interface SmsMessageRow {
  id: string;
  category: DbSmsCategory;
  status: SmsMessageStatus;
  recipientUserId: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  templateKey: string;
  body: string;
  skipReason: string | null;
  providerMessageId: string | null;
  providerStatus: string | null;
  providerStatusCheckedAt: Date | null;
  callbackStatus: string | null;
  attempts: number;
  lastError: string | null;
  acceptedAt: Date | null;
  createdAt: Date;
}

export interface SmsDeliveryAttemptRow {
  attemptNumber: number;
  outcome: string;
  providerHttpStatus: number | null;
  /** Raw provider response. The controller reduces it with safeProviderResponse before it leaves the API. */
  providerResponse: Prisma.JsonValue | null;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface SmsMessageDetailRow extends SmsMessageRow {
  callbackReceivedAt: Date | null;
  sourceDueAt: Date | null;
  attemptLog: SmsDeliveryAttemptRow[];
}

type SettingsClient = Pick<
  Prisma.TransactionClient,
  "smsRuntimeSettings" | "smsCategorySetting"
>;

const RECIPIENT_SELECT = {
  select: { id: true, firstName: true, lastName: true },
} as const;

/**
 * Persistence for SMS messages and their provider attempts. Business rules
 * live in the service.
 */
@Injectable()
export class SmsRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Inserts a message unless one with the same idempotency key already exists.
   * `ON CONFLICT DO NOTHING` is used instead of a caught unique violation,
   * because a violation would abort the caller's transaction.
   */
  async insertIfAbsent(
    tx: Prisma.TransactionClient,
    row: NewSmsMessage,
  ): Promise<string | null> {
    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "sms_messages" (
        "idempotency_key", "category", "recipient_user_id", "recipient_phone",
        "body", "template_key", "source_type", "source_id", "status", "skip_reason", "source_due_at"
      ) VALUES (
        ${row.idempotencyKey}, ${row.category}::"sms_category", ${row.recipientUserId}::uuid,
        ${row.recipientPhone}, ${row.body}, ${row.templateKey}, ${row.sourceType},
        ${row.sourceId}, ${row.status}::"sms_message_status", ${row.skipReason}, ${row.sourceDueAt}
      )
      ON CONFLICT ("idempotency_key") DO NOTHING
      RETURNING "id"
    `;
    return inserted[0]?.id ?? null;
  }

  findForDispatch(id: string): Promise<DispatchView | null> {
    return this.db.smsMessage.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        category: true,
        recipientUserId: true,
        recipientPhone: true,
        body: true,
        sourceType: true,
        sourceId: true,
        sourceDueAt: true,
      },
    });
  }

  findRecipientStatus(userId: string) {
    return this.db.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        deactivatedAt: true,
        phone: true,
        firstName: true,
        lastName: true,
      },
    });
  }

  /** Stores the number the message will actually be sent to, after a fresh check at dispatch. */
  async updateRecipientPhone(id: string, e164: string): Promise<void> {
    await this.db.smsMessage.update({
      where: { id },
      data: { recipientPhone: e164 },
    });
  }

  findIdByProviderMessageId(providerMessageId: string) {
    return this.db.smsMessage.findUnique({
      where: { providerMessageId },
      select: { id: true },
    });
  }

  findProviderMessageId(id: string) {
    return this.db.smsMessage.findUnique({
      where: { id },
      select: { providerMessageId: true },
    });
  }

  /** Moves PENDING to SENDING in one conditional update, so only one dispatcher can win. Returns the attempt number. */
  async claimForSend(id: string): Promise<number | null> {
    const claimed = await this.db.smsMessage.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "SENDING", attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) return null;
    const row = await this.db.smsMessage.findUnique({
      where: { id },
      select: { attempts: true },
    });
    return row?.attempts ?? null;
  }

  /** Writes the attempt and the resulting status in one transaction. */
  recordAttemptOutcome(
    id: string,
    attemptNumber: number,
    outcome: SendOutcome,
    startedAt: Date,
  ): Promise<void> {
    return this.db.$transaction(async (tx) => {
      const finishedAt = new Date();
      // Only a message still SENDING can take this worker's result. If the stuck
      // sweep or an administrator has already moved it, the status is left alone.
      if (outcome.kind === "ACCEPTED") {
        const moved = await tx.smsMessage.updateMany({
          where: { id, status: "SENDING" },
          data: {
            status: "ACCEPTED",
            providerMessageId: outcome.providerMessageId,
            acceptedAt: finishedAt,
            lastError: null,
          },
        });
        if (moved.count !== 1) {
          await this.keepLateAcceptance(tx, id, outcome.providerMessageId);
          return;
        }
        await tx.smsDeliveryAttempt.create({
          data: {
            smsMessageId: id,
            attemptNumber,
            outcome: "ACCEPTED",
            providerHttpStatus: outcome.httpStatus,
            providerResponse: outcome.response as Prisma.InputJsonObject,
            startedAt,
            finishedAt,
          },
        });
        return;
      }
      const isRejected = outcome.kind === "REJECTED";
      const moved = await tx.smsMessage.updateMany({
        where: { id, status: "SENDING" },
        data: {
          status: isRejected ? "FAILED" : "UNCERTAIN",
          lastError: outcome.error,
        },
      });
      if (moved.count !== 1) return;
      await tx.smsDeliveryAttempt.create({
        data: {
          smsMessageId: id,
          attemptNumber,
          outcome: isRejected ? "REJECTED" : "UNCERTAIN",
          providerHttpStatus: isRejected ? outcome.httpStatus : null,
          ...(isRejected && outcome.response
            ? {
                providerResponse: outcome.response as Prisma.InputJsonObject,
              }
            : {}),
          error: outcome.error,
          startedAt,
          finishedAt,
        },
      });
    });
  }

  /**
   * A worker reported an acceptance after the message had already left SENDING
   * (marked UNCERTAIN by the sweep, or cancelled by an administrator). The
   * provider did accept it, so keep its id for review. The status does not change.
   */
  private async keepLateAcceptance(
    tx: Prisma.TransactionClient,
    id: string,
    providerMessageId: string,
  ): Promise<void> {
    await tx.smsMessage.updateMany({
      where: { id, providerMessageId: null },
      data: {
        providerMessageId,
        lastError:
          "provider accepted this message after it left SENDING; review before any action",
      },
    });
  }

  async setStatus(
    tx: Prisma.TransactionClient | null,
    id: string,
    status: SmsStatus,
    reason: string | null,
  ): Promise<void> {
    const client = tx ?? this.db;
    // A skipped message keeps its reason in skipReason, which the database requires.
    await client.smsMessage.update({
      where: { id },
      data:
        status === "SKIPPED"
          ? { status, skipReason: reason }
          : { status, lastError: reason },
    });
  }

  async updateProviderStatus(
    id: string,
    providerStatus: string,
    checkedAt: Date,
  ): Promise<void> {
    await this.db.smsMessage.update({
      where: { id },
      data: { providerStatus, providerStatusCheckedAt: checkedAt },
    });
  }

  async recordCallback(
    id: string,
    status: string,
    receivedAt: Date,
  ): Promise<void> {
    await this.db.smsMessage.update({
      where: { id },
      data: { callbackStatus: status, callbackReceivedAt: receivedAt },
    });
  }

  findStuckSending(cutoff: Date, limit: number) {
    return this.db.smsMessage.findMany({
      where: { status: "SENDING", updatedAt: { lt: cutoff } },
      select: { id: true, attempts: true },
      orderBy: { updatedAt: "asc" },
      take: limit,
    });
  }

  /**
   * Moves one stuck SENDING message to UNCERTAIN and records why. The status
   * check and the update are one conditional write, so a message that moved on
   * in the meantime is left alone.
   */
  markStuckUncertain(
    id: string,
    attemptNumber: number,
    cutoff: Date,
  ): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      const moved = await tx.smsMessage.updateMany({
        where: { id, status: "SENDING", updatedAt: { lt: cutoff } },
        data: {
          status: "UNCERTAIN",
          lastError: "stuck in SENDING: the provider outcome is unknown",
        },
      });
      if (moved.count !== 1) return false;
      const now = new Date();
      await tx.smsDeliveryAttempt.create({
        data: {
          smsMessageId: id,
          attemptNumber,
          outcome: "UNCERTAIN",
          error: "stuck in SENDING",
          startedAt: now,
          finishedAt: now,
        },
      });
      return true;
    });
  }

  findForResolution(tx: Prisma.TransactionClient, id: string) {
    return tx.smsMessage.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
  }

  async list(input: {
    status?: SmsStatus;
    category?: SmsCategory;
    recipientUserId?: string;
    createdFrom?: Date;
    createdTo?: Date;
    page: number;
    pageSize: number;
  }): Promise<{ items: SmsMessageRow[]; total: number }> {
    const where: Prisma.SmsMessageWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.recipientUserId
        ? { recipientUserId: input.recipientUserId }
        : {}),
      ...(input.createdFrom || input.createdTo
        ? {
            createdAt: {
              ...(input.createdFrom ? { gte: input.createdFrom } : {}),
              ...(input.createdTo ? { lte: input.createdTo } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.smsMessage.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: { recipient: RECIPIENT_SELECT },
      }),
      this.db.smsMessage.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        category: row.category,
        status: row.status,
        recipientUserId: row.recipientUserId,
        recipientName: row.recipient
          ? [row.recipient.firstName, row.recipient.lastName]
              .filter(Boolean)
              .join(" ") || null
          : null,
        recipientPhone: row.recipientPhone,
        templateKey: row.templateKey,
        body: row.body,
        skipReason: row.skipReason,
        providerMessageId: row.providerMessageId,
        providerStatus: row.providerStatus,
        providerStatusCheckedAt: row.providerStatusCheckedAt,
        callbackStatus: row.callbackStatus,
        attempts: row.attempts,
        lastError: row.lastError,
        acceptedAt: row.acceptedAt,
        createdAt: row.createdAt,
      })),
      total,
    };
  }

  /** The switches a dispatch reads just before sending. Missing rows mean the defaults: global off, category on. */
  async findDispatchSwitches(
    category: DbSmsCategory,
  ): Promise<{ globalEnabled: boolean; categoryEnabled: boolean }> {
    const [runtime, categorySetting] = await Promise.all([
      this.db.smsRuntimeSettings.findUnique({
        where: { id: 1 },
        select: { globalEnabled: true },
      }),
      this.db.smsCategorySetting.findUnique({
        where: { category },
        select: { enabled: true },
      }),
    ]);
    return {
      globalEnabled: runtime?.globalEnabled ?? false,
      categoryEnabled: categorySetting?.enabled ?? true,
    };
  }

  /** Users to pick as a history filter. Returns ids and names only, never contact details. */
  searchRecipients(
    query: string,
  ): Promise<
    { id: string; firstName: string | null; lastName: string | null }[]
  > {
    const term = query.trim();
    const isId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        term,
      );
    return this.db.user.findMany({
      where: isId
        ? { id: term.toLowerCase() }
        : {
            OR: [
              { firstName: { contains: term, mode: "insensitive" } },
              { lastName: { contains: term, mode: "insensitive" } },
            ],
          },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }],
      take: 20,
    });
  }

  /** Current runtime values. Categories without a row are enabled. */
  async readRuntimeSettings(client: SettingsClient = this.db): Promise<{
    globalEnabled: boolean;
    updatedAt: Date | null;
    categories: Map<DbSmsCategory, boolean>;
  }> {
    const [runtime, rows] = await Promise.all([
      client.smsRuntimeSettings.findUnique({
        where: { id: 1 },
        select: { globalEnabled: true, updatedAt: true },
      }),
      client.smsCategorySetting.findMany({
        select: { category: true, enabled: true },
      }),
    ]);
    return {
      globalEnabled: runtime?.globalEnabled ?? false,
      updatedAt: runtime?.updatedAt ?? null,
      categories: new Map(rows.map((row) => [row.category, row.enabled])),
    };
  }

  async writeRuntimeSettings(
    tx: Prisma.TransactionClient,
    input: {
      actorUserId: string;
      globalEnabled?: boolean;
      categories: { category: DbSmsCategory; enabled: boolean }[];
    },
  ): Promise<void> {
    if (input.globalEnabled !== undefined) {
      await tx.smsRuntimeSettings.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          globalEnabled: input.globalEnabled,
          updatedById: input.actorUserId,
        },
        update: {
          globalEnabled: input.globalEnabled,
          updatedById: input.actorUserId,
        },
      });
    }
    for (const change of input.categories) {
      await tx.smsCategorySetting.upsert({
        where: { category: change.category },
        create: {
          category: change.category,
          enabled: change.enabled,
          updatedById: input.actorUserId,
        },
        update: { enabled: change.enabled, updatedById: input.actorUserId },
      });
    }
  }

  /** One message with its delivery attempts. Provider text is reduced to fixed fields and redacted of phone numbers. */
  async findDetail(id: string): Promise<SmsMessageDetailRow | null> {
    const row = await this.db.smsMessage.findUnique({
      where: { id },
      include: {
        recipient: RECIPIENT_SELECT,
        attemptLog: { orderBy: { attemptNumber: "asc" } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      category: row.category,
      status: row.status,
      recipientUserId: row.recipientUserId,
      recipientName: row.recipient
        ? [row.recipient.firstName, row.recipient.lastName]
            .filter(Boolean)
            .join(" ") || null
        : null,
      recipientPhone: row.recipientPhone,
      templateKey: row.templateKey,
      body: row.body,
      skipReason: row.skipReason,
      providerMessageId: row.providerMessageId,
      providerStatus: row.providerStatus,
      providerStatusCheckedAt: row.providerStatusCheckedAt,
      callbackStatus: row.callbackStatus,
      callbackReceivedAt: row.callbackReceivedAt,
      attempts: row.attempts,
      lastError: row.lastError,
      acceptedAt: row.acceptedAt,
      sourceDueAt: row.sourceDueAt,
      createdAt: row.createdAt,
      attemptLog: row.attemptLog.map((attempt) => ({
        attemptNumber: attempt.attemptNumber,
        outcome: attempt.outcome,
        providerHttpStatus: attempt.providerHttpStatus,
        providerResponse: attempt.providerResponse,
        error: attempt.error,
        startedAt: attempt.startedAt,
        finishedAt: attempt.finishedAt,
      })),
    };
  }
}
