import { Injectable } from "@nestjs/common";

import { Prisma, TaskStatus } from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

const PRISMA_ERROR = { uniqueViolation: "P2002" } as const;

function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

// Matches `TasksRepository`'s own inline convention for "still open"
// (e.g. its `addAssignee` visibility query) - kept inline rather than a
// separate shared helper, the same way that existing convention does.
const TERMINAL_TASK_STATUSES = [
  TaskStatus.COMPLETED,
  TaskStatus.CANCELLED,
] as const;

export interface DueTaskCandidate {
  id: string;
  dueAt: Date;
}

export interface OccurrenceClaimInput {
  ruleName: string;
  ruleVersion: number;
  resourceId: string;
  scheduledFor: Date;
}

@Injectable()
export class TasksSchedulerRepository {
  constructor(private readonly db: DatabaseService) {}

  /** Nonterminal tasks whose `dueAt` has been reached - TASK_DUE candidates. */
  async findDueCandidates(asOf: Date): Promise<DueTaskCandidate[]> {
    const rows = await this.db.task.findMany({
      where: {
        dueAt: { not: null, lte: asOf },
        status: { notIn: [...TERMINAL_TASK_STATUSES] },
      },
      select: { id: true, dueAt: true },
    });
    return rows.map((row) => ({ id: row.id, dueAt: row.dueAt! }));
  }

  /**
   * Nonterminal tasks whose `dueAt` has passed AND already have a claimed
   * `task.due` occurrence for that same `dueAt`. `TasksSchedulerService`
   * calls this before writing this tick's own due claims, so a matching
   * claim can only be from a strictly earlier tick - TASK_OVERDUE never
   * fires in the same tick as TASK_DUE for the same task, even right after
   * downtime.
   */
  async findOverdueCandidates(
    asOf: Date,
    dueRuleName: string,
    dueRuleVersion: number,
  ): Promise<DueTaskCandidate[]> {
    const candidates = await this.db.task.findMany({
      where: {
        dueAt: { not: null, lt: asOf },
        status: { notIn: [...TERMINAL_TASK_STATUSES] },
      },
      select: { id: true, dueAt: true },
    });
    if (candidates.length === 0) return [];
    const dueClaims = await this.db.scheduledOccurrenceClaim.findMany({
      where: {
        ruleName: dueRuleName,
        ruleVersion: dueRuleVersion,
        resourceId: { in: candidates.map((candidate) => candidate.id) },
      },
      select: { resourceId: true, scheduledFor: true },
    });
    const claimed = new Set(
      dueClaims.map(
        (claim) => `${claim.resourceId}:${claim.scheduledFor.getTime()}`,
      ),
    );
    return candidates
      .filter((candidate) =>
        claimed.has(`${candidate.id}:${candidate.dueAt!.getTime()}`),
      )
      .map((candidate) => ({ id: candidate.id, dueAt: candidate.dueAt! }));
  }

  /**
   * Claims one scheduled occurrence inside the given transaction (ADR 0003
   * §3: a database-backed claim, not a process-local timer). Returns `false`
   * on a unique-constraint conflict - another tick (or a concurrent scanner
   * instance) already claimed this exact `(rule, resource, instant)`, which
   * is a successful idempotent no-op here, not an error.
   */
  async tryClaim(
    tx: Prisma.TransactionClient,
    input: OccurrenceClaimInput,
  ): Promise<boolean> {
    try {
      await tx.scheduledOccurrenceClaim.create({
        data: {
          ruleName: input.ruleName,
          ruleVersion: input.ruleVersion,
          resourceId: input.resourceId,
          scheduledFor: input.scheduledFor,
        },
        select: { id: true },
      });
      return true;
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.uniqueViolation)) return false;
      throw error;
    }
  }
}
