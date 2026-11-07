import { timingSafeEqual } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";

import { AuditWriterService } from "../audit/audit-writer.service.js";
import { DatabaseService } from "../database/database.service.js";
import {
  AuditActorKind,
  AuditOutcome,
  type OutboxActorKind,
  type Prisma,
} from "../generated/prisma/client.js";
import { OutboxWriterService } from "../outbox/outbox-writer.service.js";
import type { ClaimedOutboxDelivery } from "../outbox/outbox.types.js";
import { ENVIRONMENT, type Environment } from "../config/environment.js";
import {
  smsCallbackNotFound,
  smsMessageNotFound,
  smsMessageNotResolvable,
} from "./sms.errors.js";
import {
  SmsRepository,
  type DispatchView,
  type SmsMessageRow,
} from "./sms.repository.js";

/**
 * A category rule checked at send time. Returns a reason to cancel the message,
 * or null when it may be sent. Business modules register these; the SMS module
 * knows nothing about tasks.
 */
export type SmsPrecondition = (message: DispatchView) => Promise<string | null>;

/** Savepoint name for SMS work inside a business transaction. Used one level deep only. */
const SMS_SAVEPOINT = "sms_isolated_work";
import { StatusCheckRateLimiter } from "./sms-rate-limiter.js";
import { normalizeEthiopianPhone } from "./phone.js";
import { renderTemplate, type SmsTemplateName } from "./templates.js";
import {
  SMS_CONSUMER_NAME,
  SMS_CONSUMER_VERSION,
  type SmsCategory,
  type SmsProvider,
  type SmsStatus,
  SMS_PROVIDER,
  SMS_SENDING_TIMEOUT_MS,
  type SendOutcome,
} from "./sms.types.js";

export interface EnqueueSmsInput {
  category: SmsCategory;
  /** Stable per business event and recipient, for example `task.assigned:<taskId>:<userId>`. */
  idempotencyKey: string;
  recipientUserId: string | null;
  /** Free text from the profile. It is normalized here and never stored when invalid. */
  recipientPhone: string | null | undefined;
  template: SmsTemplateName;
  params?: Record<string, string>;
  sourceType?: string;
  sourceId?: string;
  /** For reminders: the due date the message is scheduled for. */
  sourceDueAt?: Date | null;
  actorKind: OutboxActorKind;
  actorUserId?: string;
  requestId?: string;
}

export type EnqueueResult =
  | { kind: "DISABLED" }
  | { kind: "DUPLICATE" }
  | { kind: "SKIPPED"; id: string; reason: string }
  | { kind: "QUEUED"; id: string };

export interface SmsServiceStatus {
  enabled: boolean;
  apiKeyConfigured: boolean;
  senderConfigured: boolean;
  callbackConfigured: boolean;
  timeoutMs: number;
}

export type StatusCheckResult =
  | { kind: "OK"; providerStatus: string }
  | { kind: "NO_PROVIDER_ID" }
  | { kind: "RATE_LIMITED" }
  | { kind: "ERROR" };

/**
 * The centralized SMS boundary. Business modules call `enqueue` inside their
 * own transaction; delivery happens later through the outbox consumer, so an
 * SMS failure can never roll back a task, meeting or report change.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly preconditions = new Map<SmsCategory, SmsPrecondition>();

  /** Registers the send-time rule for a category. One rule per category. */
  registerPrecondition(category: SmsCategory, check: SmsPrecondition): void {
    this.preconditions.set(category, check);
  }

  constructor(
    @Inject(ENVIRONMENT) private readonly environment: Environment,
    @Inject(SMS_PROVIDER) private readonly provider: SmsProvider,
    private readonly db: DatabaseService,
    private readonly repository: SmsRepository,
    private readonly outbox: OutboxWriterService,
    private readonly audit: AuditWriterService,
    private readonly limiter: StatusCheckRateLimiter,
  ) {}

  status(): SmsServiceStatus {
    const env = this.environment;
    return {
      enabled: env.AFROMESSAGE_ENABLED,
      apiKeyConfigured: env.AFROMESSAGE_API_KEY.length > 0,
      senderConfigured: env.AFROMESSAGE_SENDER_ID.length > 0,
      callbackConfigured: env.AFROMESSAGE_CALLBACK_TOKEN.length > 0,
      timeoutMs: env.AFROMESSAGE_TIMEOUT_MS,
    };
  }

  /**
   * Runs SMS work inside a savepoint of the caller's transaction. If the work
   * fails, only the savepoint is rolled back, so the business change in the same
   * transaction still commits. Returns null on failure, after logging it. If the
   * savepoint cannot be rolled back, the error is thrown, because the transaction
   * can no longer be trusted.
   */
  async isolate<T>(
    tx: Prisma.TransactionClient,
    label: string,
    work: () => Promise<T>,
    /**
     * Runs after the savepoint is rolled back, still inside the business
     * transaction. Use it to leave a durable record of a failure that cannot be
     * retried automatically.
     */
    onFailure?: (error: unknown) => Promise<void>,
  ): Promise<T | null> {
    await tx.$executeRawUnsafe(`SAVEPOINT ${SMS_SAVEPOINT}`);
    try {
      const result = await work();
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${SMS_SAVEPOINT}`);
      return result;
    } catch (error) {
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${SMS_SAVEPOINT}`);
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${SMS_SAVEPOINT}`);
      const reason = error instanceof Error ? error.message : "unknown error";
      this.logger.error(`${label} SMS could not be queued: ${reason}`);
      if (onFailure) await onFailure(error);
      return null;
    }
  }

  /**
   * Records an SMS inside the caller's transaction. A repeated call with the
   * same idempotency key is a no-op. An invalid or missing phone is recorded
   * as SKIPPED and does not reach the queue.
   */
  async enqueue(
    tx: Prisma.TransactionClient,
    input: EnqueueSmsInput,
  ): Promise<EnqueueResult> {
    if (!this.environment.AFROMESSAGE_ENABLED) return { kind: "DISABLED" };

    const body = renderTemplate(input.template, input.params);
    const phone = normalizeEthiopianPhone(input.recipientPhone);
    const status = phone.ok ? "PENDING" : "SKIPPED";
    const reason = phone.ok ? null : phone.reason;

    const id = await this.repository.insertIfAbsent(tx, {
      idempotencyKey: input.idempotencyKey,
      category: input.category,
      recipientUserId: input.recipientUserId,
      recipientPhone: phone.ok ? phone.e164 : null,
      body,
      templateKey: input.template,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      status,
      skipReason: reason,
      sourceDueAt: input.sourceDueAt ?? null,
    });
    if (id === null) return { kind: "DUPLICATE" };

    if (!phone.ok) {
      return { kind: "SKIPPED", id, reason: phone.reason };
    }
    await this.outbox.append(tx, {
      name: "sms.message.requested",
      version: 1,
      actorKind: input.actorKind,
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      ...(input.requestId ? { correlationId: input.requestId } : {}),
      resourceType: "sms_message",
      resourceId: id,
      payload: { smsMessageId: id },
      consumers: [
        {
          consumerName: SMS_CONSUMER_NAME,
          consumerVersion: SMS_CONSUMER_VERSION,
        },
      ],
    });
    return { kind: "QUEUED", id };
  }

  /**
   * The outbox consumer. It is safe to run more than once: the message must
   * still be PENDING, and the claim is a conditional update. A send that
   * times out is recorded as UNCERTAIN and returns normally, so the outbox is
   * never asked to retry it.
   */
  async dispatch(event: ClaimedOutboxDelivery["event"]): Promise<void> {
    const payload = event.payload as { smsMessageId?: unknown } | null;
    if (typeof payload?.smsMessageId !== "string") {
      this.logger.warn(`sms event ${event.id} has no message id; dropped`);
      return;
    }
    const id = payload.smsMessageId;
    const message = await this.repository.findForDispatch(id);
    if (!message || message.status !== "PENDING") return;

    if (!this.environment.AFROMESSAGE_ENABLED) {
      await this.repository.setStatus(null, id, "FAILED", "PROVIDER_DISABLED");
      return;
    }

    // Recheck the recipient at send time: the account must still be active,
    // and the number sent to is the one on the profile now, not the one stored
    // when the message was queued.
    let to = message.recipientPhone;
    if (message.recipientUserId) {
      const recipient = await this.repository.findRecipientStatus(
        message.recipientUserId,
      );
      if (
        !recipient ||
        recipient.status !== "ACTIVE" ||
        recipient.deactivatedAt !== null
      ) {
        await this.repository.setStatus(
          null,
          id,
          "CANCELLED",
          "RECIPIENT_INACTIVE",
        );
        return;
      }
      const current = normalizeEthiopianPhone(recipient.phone);
      if (!current.ok) {
        await this.repository.setStatus(null, id, "SKIPPED", current.reason);
        return;
      }
      if (current.e164 !== message.recipientPhone) {
        await this.repository.updateRecipientPhone(id, current.e164);
        to = current.e164;
      }
    }
    if (!to) {
      await this.repository.setStatus(
        null,
        id,
        "SKIPPED",
        "MISSING_PHONE_NUMBER",
      );
      return;
    }

    // Category rules (for example, the task is still open and still assigned to
    // this person). A failed rule cancels the message; nothing is sent.
    const precondition = this.preconditions.get(message.category);
    const blockedBy = precondition ? await precondition(message) : null;
    if (blockedBy) {
      await this.repository.setStatus(null, id, "CANCELLED", blockedBy);
      return;
    }

    const attemptNumber = await this.repository.claimForSend(id);
    if (attemptNumber === null) return;

    const startedAt = new Date();
    let outcome: SendOutcome;
    try {
      outcome = await this.provider.send({
        to,
        message: message.body,
        sender: this.environment.AFROMESSAGE_SENDER_ID,
        ...(this.environment.AFROMESSAGE_IDENTIFIER_ID
          ? { identifierId: this.environment.AFROMESSAGE_IDENTIFIER_ID }
          : {}),
      });
    } catch {
      // The request may have reached the provider. Never resend automatically.
      outcome = {
        kind: "UNCERTAIN",
        error: "provider call failed unexpectedly",
      };
    }
    await this.repository.recordAttemptOutcome(
      id,
      attemptNumber,
      outcome,
      startedAt,
    );
    this.logger.log(
      `sms ${id} attempt ${attemptNumber}: ${outcome.kind.toLowerCase()}`,
    );
  }

  /**
   * Confirms a message's status through the provider's status endpoint,
   * rate-limited to the documented limit. Only this path records provider status.
   */
  async checkStatus(id: string): Promise<StatusCheckResult> {
    const row = await this.repository.findProviderMessageId(id);
    if (!row) return { kind: "ERROR" };
    if (!row.providerMessageId) return { kind: "NO_PROVIDER_ID" };
    if (!this.limiter.tryAcquire()) return { kind: "RATE_LIMITED" };

    const outcome = await this.provider.getStatus(row.providerMessageId);
    if (outcome.kind === "ERROR") {
      if (outcome.rateLimited) this.limiter.block();
      return { kind: "ERROR" };
    }
    await this.repository.updateProviderStatus(
      id,
      outcome.providerStatus,
      new Date(),
    );
    return { kind: "OK", providerStatus: outcome.providerStatus };
  }

  /**
   * Handles the provider's delivery callback. The path token is compared in
   * constant time. A callback only records what it claims and asks for a
   * status check; it does not change the message on its own.
   */
  async handleCallback(
    token: string,
    providerMessageId: string,
    status: string,
  ): Promise<void> {
    const expected = this.environment.AFROMESSAGE_CALLBACK_TOKEN;
    if (!expected || !tokensMatch(token, expected)) throw smsCallbackNotFound();

    const row =
      await this.repository.findIdByProviderMessageId(providerMessageId);
    if (!row) return;
    await this.repository.recordCallback(
      row.id,
      status.slice(0, 100),
      new Date(),
    );
    void this.checkStatus(row.id).catch((error: unknown) => {
      this.logger.warn(
        `sms status check after callback failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
    });
  }

  /**
   * Recovers messages left in SENDING, for example after a crash or a failed
   * database write following a provider call. They become UNCERTAIN, which
   * needs an administrator's decision. They are never resent here.
   */
  async recoverStuckSending(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - SMS_SENDING_TIMEOUT_MS);
    const stuck = await this.repository.findStuckSending(cutoff, 100);
    let recovered = 0;
    for (const row of stuck) {
      if (
        await this.repository.markStuckUncertain(row.id, row.attempts, cutoff)
      ) {
        recovered += 1;
      }
    }
    if (recovered > 0) {
      this.logger.warn(
        `recovered ${recovered} SMS stuck in SENDING; marked UNCERTAIN`,
      );
    }
    return recovered;
  }

  list(input: {
    status?: SmsStatus;
    category?: SmsCategory;
    page: number;
    pageSize: number;
  }): Promise<{ items: SmsMessageRow[]; total: number }> {
    return this.repository.list(input);
  }

  /**
   * Administrator resolution of an uncertain send. `CANCEL` closes it without
   * sending. `REQUEUE` sends it again on purpose, which is the administrator's
   * decision and never automatic.
   */
  async resolve(input: {
    actingUserId: string;
    id: string;
    decision: "CANCEL" | "REQUEUE";
    requestId: string;
  }): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const row = await this.repository.findForResolution(tx, input.id);
      if (!row) throw smsMessageNotFound();
      if (row.status !== "UNCERTAIN" && row.status !== "SENDING") {
        throw smsMessageNotResolvable();
      }
      if (input.decision === "CANCEL") {
        await this.repository.setStatus(
          tx,
          input.id,
          "CANCELLED",
          "CANCELLED_BY_ADMIN",
        );
      } else {
        await this.repository.setStatus(tx, input.id, "PENDING", null);
        await this.outbox.append(tx, {
          name: "sms.message.requested",
          version: 1,
          actorKind: "USER",
          actorUserId: input.actingUserId,
          correlationId: input.requestId,
          resourceType: "sms_message",
          resourceId: input.id,
          payload: { smsMessageId: input.id },
          consumers: [
            {
              consumerName: SMS_CONSUMER_NAME,
              consumerVersion: SMS_CONSUMER_VERSION,
            },
          ],
        });
      }
      await this.audit.append(tx, {
        action: "sms.message.resolved",
        actorKind: AuditActorKind.USER,
        actorUserId: input.actingUserId,
        requestId: input.requestId,
        resourceType: "sms_message",
        resourceId: input.id,
        outcome: AuditOutcome.SUCCEEDED,
        metadata: { decision: input.decision, previousStatus: row.status },
      });
    });
  }

  /**
   * Checks credentials and connectivity by reading the balance. No SMS is sent.
   */
  async testConnection(input: {
    actingUserId: string;
    requestId: string;
  }): Promise<{
    ok: boolean;
    reason?: string;
    balance?: string;
    estimatedMessages?: string;
  }> {
    if (!this.environment.AFROMESSAGE_ENABLED) {
      return { ok: false, reason: "SMS_DISABLED" };
    }
    const outcome = await this.provider.getBalance();
    await this.audit.record({
      action: "sms.provider.tested",
      actorKind: AuditActorKind.USER,
      actorUserId: input.actingUserId,
      requestId: input.requestId,
      resourceType: "sms_message",
      resourceId: null,
      outcome:
        outcome.kind === "OK" ? AuditOutcome.SUCCEEDED : AuditOutcome.FAILED,
    });
    if (outcome.kind === "ERROR")
      return { ok: false, reason: "PROVIDER_ERROR" };
    return {
      ok: true,
      balance: outcome.balance,
      estimatedMessages: outcome.estimatedMessages,
    };
  }
}

/** Constant-time comparison; differing lengths fail without leaking which byte differs. */
function tokensMatch(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
