import { Injectable } from "@nestjs/common";

import { OutboxDeliveryStatus, Prisma } from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";
import type {
  AppendOutboxEventInput,
  ClaimedOutboxDelivery,
} from "../outbox.types.js";

/** ADR 0004 §6's fixed backoff schedule, indexed by the attempt number that just failed. */
const BACKOFF_SECONDS_BY_ATTEMPT: Record<number, number> = {
  1: 30,
  2: 120,
  3: 600,
};
/** One initial attempt plus three retries (ADR 0001 §4); the fourth failure is durably FAILED. */
const MAX_ATTEMPTS = 4;
/**
 * The claiming transaction's row lock is released as soon as it commits, so
 * a due row must not stay immediately re-claimable while it is mid-process -
 * otherwise a second poller (an overlapping tick, or a second API replica)
 * could reprocess the same delivery before the first finishes. ADR 0004 §6
 * does not name a separate lease figure, so this reuses the schedule's own
 * first backoff step: a crash mid-process is then indistinguishable from an
 * ordinary first failure once the lease lapses.
 */
const CLAIM_LEASE_SECONDS = BACKOFF_SECONDS_BY_ATTEMPT[1]!;

@Injectable()
export class OutboxRepository {
  constructor(private readonly db: DatabaseService) {}

  async append(
    tx: Prisma.TransactionClient,
    input: AppendOutboxEventInput,
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        ...(input.eventId ? { id: input.eventId } : {}),
        name: input.name,
        version: input.version,
        occurredAt: input.occurredAt ?? new Date(),
        actorKind: input.actorKind,
        ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
        ...(input.correlationId ? { correlationId: input.correlationId } : {}),
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        ...(input.workspaceContext
          ? { workspaceContext: input.workspaceContext }
          : {}),
        payload: input.payload ?? {},
        deliveries: {
          create: input.consumers.map((consumer) => ({
            consumerName: consumer.consumerName,
            consumerVersion: consumer.consumerVersion,
          })),
        },
      },
      select: { id: true },
    });
  }

  /**
   * Claims up to `limit` due deliveries for one consumer (ADR 0004 §6):
   * pending, due rows in `(createdAt, id)` order under
   * `FOR UPDATE SKIP LOCKED`, so concurrent pollers can never claim the same
   * row twice. `attempts` is incremented immediately, inside the same
   * claiming transaction, so a crash between claim and completion still
   * counts toward the retry ceiling instead of being retried forever.
   */
  async claimBatch(
    consumerName: string,
    consumerVersion: number,
    limit: number,
  ): Promise<ClaimedOutboxDelivery[]> {
    return this.db.$transaction(async (tx) => {
      // Self-healing sweep: a process crash between a successful claim and
      // the relay recording its outcome leaves a row `PENDING` with
      // `attempts` already at the ceiling but never durably `FAILED` (the
      // ceiling check normally lives in `markFailed`, which a crash never
      // reaches). Finalizing any such row here, on the next claim attempt by
      // anyone, closes that gap without a separate sweep job.
      await tx.outboxDelivery.updateMany({
        where: {
          status: OutboxDeliveryStatus.PENDING,
          consumerName,
          consumerVersion,
          nextAttemptAt: { lte: new Date() },
          attempts: { gte: MAX_ATTEMPTS },
        },
        data: {
          status: OutboxDeliveryStatus.FAILED,
          lastError:
            "Exceeded the retry ceiling without a recorded failure - likely a crash between claim and completion.",
        },
      });

      const claimed = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT id FROM outbox_deliveries
          WHERE status = ${OutboxDeliveryStatus.PENDING}::outbox_delivery_status
            AND consumer_name = ${consumerName}
            AND consumer_version = ${consumerVersion}
            AND next_attempt_at <= now()
          ORDER BY created_at, id
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        `,
      );
      if (claimed.length === 0) return [];
      const ids = claimed.map((row) => row.id);
      await tx.outboxDelivery.updateMany({
        where: { id: { in: ids } },
        data: {
          attempts: { increment: 1 },
          nextAttemptAt: new Date(Date.now() + CLAIM_LEASE_SECONDS * 1000),
        },
      });
      const deliveries = await tx.outboxDelivery.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          attempts: true,
          event: {
            select: {
              id: true,
              name: true,
              version: true,
              occurredAt: true,
              actorKind: true,
              actorUserId: true,
              correlationId: true,
              resourceType: true,
              resourceId: true,
              workspaceContext: true,
              payload: true,
            },
          },
        },
      });
      const byId = new Map(
        deliveries.map((delivery) => [delivery.id, delivery]),
      );
      // Preserve the claim query's (createdAt, id) order.
      return ids.flatMap((id) => {
        const row = byId.get(id);
        return row
          ? [{ deliveryId: row.id, attempts: row.attempts, event: row.event }]
          : [];
      });
    });
  }

  async markSucceeded(deliveryId: string): Promise<void> {
    await this.db.outboxDelivery.update({
      where: { id: deliveryId },
      data: {
        status: OutboxDeliveryStatus.SUCCEEDED,
        succeededAt: new Date(),
      },
    });
  }

  /** Schedules the next backoff step, or marks the delivery durably `FAILED`
   * once `attempts` has reached the retry ceiling (ADR 0001 §4; ADR 0004 §6). */
  async markFailed(
    deliveryId: string,
    attempts: number,
    error: string,
  ): Promise<void> {
    if (attempts >= MAX_ATTEMPTS) {
      await this.db.outboxDelivery.update({
        where: { id: deliveryId },
        data: { status: OutboxDeliveryStatus.FAILED, lastError: error },
      });
      return;
    }
    const backoffSeconds = BACKOFF_SECONDS_BY_ATTEMPT[attempts] ?? 600;
    await this.db.outboxDelivery.update({
      where: { id: deliveryId },
      data: {
        nextAttemptAt: new Date(Date.now() + backoffSeconds * 1000),
        lastError: error,
      },
    });
  }
}
