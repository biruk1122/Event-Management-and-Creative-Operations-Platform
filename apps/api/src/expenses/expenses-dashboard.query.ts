import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  operationalList,
  sourceScope,
  type ReadContext,
  type ReadWindow,
} from "../common/queries/operational-read.js";
import type { DashboardBudgetItem } from "../dashboards/dashboards.contracts.js";

@Injectable()
export class ExpensesDashboardQuery {
  constructor(private readonly db: DatabaseService) {}

  /** Super-Admin-only by construction (EOM-01): `expense.approve` is never
   * granted at DEPARTMENT or SELF scope in the catalog, the same
   * "sensitive, approval-gated" idiom `event.budget.*` already uses - this
   * card needs no extra code to stay restricted to whoever can actually
   * approve an expense. */
  async pendingApprovals(ctx: ReadContext, w: ReadWindow) {
    const scope = sourceScope(ctx, "expense.approve", ["organization"]);
    const data = await operationalList(
      this.db,
      Prisma.sql`
      SELECT jsonb_build_object('id',x.id,'kind','EXPENSE','title',x.description,
        'status',x.status,'dueAt',x.submitted_at) AS item
      FROM expenses x WHERE x.status = 'SUBMITTED'
      ORDER BY x.submitted_at,x.id LIMIT ${w.limit + 1}`,
      w.limit,
    );
    return { scope, data };
  }

  /** Rejected expenses awaiting manager follow-up (EOM-01 operational-issues
   * signal) - a pure aggregation of an existing status, no new entity. */
  async rejected(ctx: ReadContext, w: ReadWindow) {
    const scope = sourceScope(ctx, "expense.read", [
      "organization",
      "department",
    ]);
    const visible =
      scope === "organization"
        ? Prisma.sql`true`
        : Prisma.sql`x.department_id = ${ctx.departmentId}::uuid`;
    const data = await operationalList(
      this.db,
      Prisma.sql`
      SELECT jsonb_build_object('id',x.id,'kind','EXPENSE','title',x.description,
        'status',x.status,'dueAt',x.reviewed_at) AS item
      FROM expenses x WHERE ${visible} AND x.status = 'REJECTED'
      ORDER BY x.reviewed_at DESC,x.id LIMIT ${w.limit + 1}`,
      w.limit,
    );
    return { scope, data };
  }

  /** Planned vs. actual, per event (EOM-01 budget comparison) - deliberately
   * not a single cross-event sum, since events may carry different budget
   * currencies. `actualApproved`/`actualPending` are always reported
   * separately, so a pending expense is never read as approved spending. */
  async budgetSummary(ctx: ReadContext, w: ReadWindow) {
    const scope = sourceScope(ctx, "event.budget.read", [
      "organization",
      "department",
    ]);
    const visible =
      scope === "organization"
        ? Prisma.sql`true`
        : Prisma.sql`e.department_id = ${ctx.departmentId}::uuid`;
    const rows = await this.db.readModel<DashboardBudgetItem>(Prisma.sql`
      SELECT e.id AS "eventId", e.name AS "eventName",
        to_char(e.budget_amount, 'FM999999999999990.00') AS "plannedAmount",
        nullif(trim(e.budget_currency), '') AS currency,
        to_char(coalesce(x.actual_approved, 0), 'FM999999999999990.00') AS "actualApproved",
        to_char(coalesce(x.actual_pending, 0), 'FM999999999999990.00') AS "actualPending"
      FROM events e
      LEFT JOIN LATERAL (
        SELECT
          sum(actual_amount) FILTER (WHERE status = 'APPROVED') AS actual_approved,
          sum(actual_amount) FILTER (WHERE status = 'SUBMITTED') AS actual_pending
        FROM expenses WHERE event_id = e.id
      ) x ON true
      WHERE ${visible}
        AND (e.budget_amount IS NOT NULL OR x.actual_approved IS NOT NULL OR x.actual_pending IS NOT NULL)
      ORDER BY e.created_at DESC, e.id LIMIT ${w.limit + 1}`);
    return {
      scope,
      data: {
        items: rows.slice(0, w.limit),
        hasMore: rows.length > w.limit,
      },
    };
  }
}
