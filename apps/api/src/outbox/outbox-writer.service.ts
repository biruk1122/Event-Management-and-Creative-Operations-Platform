import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { AppendOutboxEventInput } from "./outbox.types.js";
import { OutboxRepository } from "./infrastructure/outbox.repository.js";

/**
 * The producer-facing boundary of the durable outbox (ADR 0001 §1, §3).
 * Mirrors `AuditWriterService`: `append` writes inside a caller's own
 * transaction so the domain mutation and its outbox event commit atomically;
 * `record` is for the rare caller with no surrounding transaction of its own.
 */
@Injectable()
export class OutboxWriterService {
  constructor(
    private readonly db: DatabaseService,
    private readonly repository: OutboxRepository,
  ) {}

  append(
    tx: Prisma.TransactionClient,
    input: AppendOutboxEventInput,
  ): Promise<void> {
    return this.repository.append(tx, input);
  }

  async record(input: AppendOutboxEventInput): Promise<void> {
    await this.db.$transaction((tx) => this.repository.append(tx, input));
  }
}
