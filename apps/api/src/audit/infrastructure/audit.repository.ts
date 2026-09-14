import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../generated/prisma/client.js";
import type { AppendAuditRecordInput } from "../audit.types.js";

@Injectable()
export class AuditRepository {
  async append(
    tx: Prisma.TransactionClient,
    input: AppendAuditRecordInput,
  ): Promise<void> {
    await tx.auditRecord.create({
      data: {
        action: input.action,
        actorKind: input.actorKind,
        outcome: input.outcome,
        resourceId: input.resourceId,
        resourceType: input.resourceType,
        ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
        ...(input.requestId ? { requestId: input.requestId } : {}),
        ...(input.correlationId ? { correlationId: input.correlationId } : {}),
        ...(input.workspaceContext
          ? { workspaceContext: input.workspaceContext }
          : {}),
        metadata: input.metadata ?? {},
      },
      select: { id: true },
    });
  }
}
