import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { AppendAuditRecordInput } from "./audit.types.js";
import { AuditRepository } from "./infrastructure/audit.repository.js";

/**
 * Internal append-only audit boundary. REL-02 later adds authorized reads,
 * export, retention, and storage-level tamper controls without changing
 * callers that already write through this service.
 */
@Injectable()
export class AuditWriterService {
  constructor(
    private readonly db: DatabaseService,
    private readonly repository: AuditRepository,
  ) {}

  append(
    tx: Prisma.TransactionClient,
    input: AppendAuditRecordInput,
  ): Promise<void> {
    return this.repository.append(tx, input);
  }

  async record(input: AppendAuditRecordInput): Promise<void> {
    await this.db.$transaction((tx) => this.repository.append(tx, input));
  }
}
