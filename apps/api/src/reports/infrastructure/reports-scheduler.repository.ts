import { Injectable } from "@nestjs/common";

import { Prisma, ReportStatus } from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

export interface ReportReminderCandidate {
  id: string;
  periodEnd: Date;
}

/** Start of `asOf`'s own UTC calendar date - `periodEnd` is a `@db.Date`
 * column (stored as UTC midnight of that date), so "the period has fully
 * elapsed" means this boundary has passed, not `periodEnd` itself. */
function startOfUtcDay(asOf: Date): Date {
  return new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()),
  );
}

@Injectable()
export class ReportsSchedulerRepository {
  constructor(private readonly db: DatabaseService) {}

  /** A report still open (DRAFT or CHANGES_REQUESTED - the same two states
   * `reports.policy.ts`'s own `canEdit()` treats as "not yet finalized")
   * whose period has fully elapsed in UTC. */
  async findReminderCandidates(asOf: Date): Promise<ReportReminderCandidate[]> {
    return this.db.report.findMany({
      where: {
        status: { in: [ReportStatus.DRAFT, ReportStatus.CHANGES_REQUESTED] },
        periodEnd: { lt: startOfUtcDay(asOf) },
      },
      select: { id: true, periodEnd: true },
    });
  }

  async tryClaim(
    tx: Prisma.TransactionClient,
    report: ReportReminderCandidate,
  ): Promise<boolean> {
    try {
      await tx.scheduledOccurrenceClaim.create({
        data: {
          ruleName: "report.reminder",
          ruleVersion: 1,
          resourceId: report.id,
          scheduledFor: report.periodEnd,
        },
        select: { id: true },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return false;
      throw error;
    }
  }
}
