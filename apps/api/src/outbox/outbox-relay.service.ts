import { Injectable } from "@nestjs/common";

import type { ClaimedOutboxDelivery } from "./outbox.types.js";
import { OutboxRepository } from "./infrastructure/outbox.repository.js";

/**
 * The consumer-facing boundary of the durable outbox (ADR 0004 §6): claiming
 * due deliveries and recording their outcome. A relay module injects this
 * instead of `OutboxRepository` directly, mirroring how a producer module
 * injects `OutboxWriterService` instead - `OutboxRepository` stays private to
 * this module either way.
 */
@Injectable()
export class OutboxRelayService {
  constructor(private readonly repository: OutboxRepository) {}

  claimBatch(
    consumerName: string,
    consumerVersion: number,
    limit: number,
  ): Promise<ClaimedOutboxDelivery[]> {
    return this.repository.claimBatch(consumerName, consumerVersion, limit);
  }

  markSucceeded(deliveryId: string): Promise<void> {
    return this.repository.markSucceeded(deliveryId);
  }

  markFailed(
    deliveryId: string,
    attempts: number,
    error: string,
  ): Promise<void> {
    return this.repository.markFailed(deliveryId, attempts, error);
  }
}
