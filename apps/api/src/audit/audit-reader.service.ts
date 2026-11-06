import { Injectable } from "@nestjs/common";

import type { Prisma } from "../generated/prisma/client.js";
import { DatabaseService } from "../database/database.service.js";
import type { SupportedAuditAction } from "./audit.types.js";

/**
 * Each branch names its own actions and its own scope, so a record is returned
 * only when its action is allowed for the scope it was matched on. A task
 * action is matched by the task it names, never by workspace, so a task stored
 * in an event's workspace cannot leak past task visibility.
 */
export interface WorkActivityQuery {
  /** Event actions, matched by the workspace they were written in. */
  workspaceId: string;
  eventActions: readonly SupportedAuditAction[];
  /** Task actions, matched only by these visible task ids. */
  taskActions: readonly SupportedAuditAction[];
  taskIds: readonly string[];
  /** Talent actions, matched by the work id in their metadata. */
  talentActions: readonly SupportedAuditAction[];
  workId: string;
  limit: number;
}

export interface WorkActivityRecord {
  id: string;
  occurredAt: Date;
  action: string;
  actorUserId: string | null;
  metadata: unknown;
}

/**
 * The one narrow read of the audit log: the successful, allowlisted actions for
 * a single piece of work, newest first. It is not the general authorized audit
 * read that REL-02 plans, and it does not widen who may see audit records.
 */
@Injectable()
export class AuditReaderService {
  constructor(private readonly db: DatabaseService) {}

  listWorkActivity(query: WorkActivityQuery): Promise<WorkActivityRecord[]> {
    const branches: Prisma.AuditRecordWhereInput[] = [];
    if (query.eventActions.length > 0) {
      branches.push({
        action: { in: [...query.eventActions] },
        workspaceContext: query.workspaceId,
      });
    }
    if (query.taskActions.length > 0 && query.taskIds.length > 0) {
      branches.push({
        action: { in: [...query.taskActions] },
        resourceType: "task",
        resourceId: { in: [...query.taskIds] },
      });
    }
    if (query.talentActions.length > 0) {
      branches.push({
        action: { in: [...query.talentActions] },
        resourceType: "talent",
        metadata: { path: ["workId"], equals: query.workId },
      });
    }
    if (branches.length === 0) return Promise.resolve([]);
    return this.db.auditRecord.findMany({
      where: { outcome: "SUCCEEDED", OR: branches },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: query.limit,
      select: {
        id: true,
        occurredAt: true,
        action: true,
        actorUserId: true,
        metadata: true,
      },
    });
  }
}
