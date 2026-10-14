import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service.js";

/** Read-only reporting projection: planned vs. actual for one event's
 * workspace (EOM-01 post-event reports). `actualApproved`/`actualPending`
 * are always computed separately - a pending (SUBMITTED) expense is never
 * read as approved spending. Nothing here is copied into the report row. */
@Injectable()
export class ExpensesReportFactsQuery {
  constructor(private readonly db: DatabaseService) {}

  async forWorkspace(workspaceId: string) {
    const event = await this.db.event.findUnique({
      where: { workspaceId },
      select: { id: true, budgetAmount: true, budgetCurrency: true },
    });
    if (!event) return null;
    const sums = await this.db.expense.groupBy({
      by: ["status"],
      where: { eventId: event.id, status: { in: ["APPROVED", "SUBMITTED"] } },
      _sum: { actualAmount: true },
    });
    const approved = sums.find((row) => row.status === "APPROVED");
    const pending = sums.find((row) => row.status === "SUBMITTED");
    return {
      plannedAmount:
        event.budgetAmount === null ? null : event.budgetAmount.toFixed(2),
      currency:
        event.budgetCurrency === null ? null : event.budgetCurrency.trim(),
      actualApproved: approved?._sum.actualAmount?.toFixed(2) ?? "0.00",
      actualPending: pending?._sum.actualAmount?.toFixed(2) ?? "0.00",
    };
  }
}
