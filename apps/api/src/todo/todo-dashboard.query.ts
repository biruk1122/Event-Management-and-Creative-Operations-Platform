import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  operationalList,
  sourceScope,
  type ReadContext,
  type ReadWindow,
} from "../common/queries/operational-read.js";
@Injectable()
export class TodoDashboardQuery {
  constructor(private readonly db: DatabaseService) {}
  async list(ctx: ReadContext, deadlines: boolean, w: ReadWindow) {
    sourceScope(ctx, "todo.read", ["organization", "self"]);
    const from = w.from.toISOString().slice(0, 10);
    const to = w.to.toISOString().slice(0, 10);
    const upperExclusive = w.to.toISOString().slice(11) === "00:00:00.000Z";
    return {
      scope: "self" as const,
      data: await operationalList(
        this.db,
        Prisma.sql`
      SELECT jsonb_build_object('id',t.id,'title',t.title,'kind','TODO','status',t.status,
        'dueDate',to_char(t.due_date,'YYYY-MM-DD'),'dueTime',t.due_time::text) AS item
      FROM todos t WHERE t.user_id=${ctx.userId}::uuid AND t.status IN ('NOT_STARTED','IN_PROGRESS')
      AND (${!deadlines} OR t.due_date >= ${from}::date AND (t.due_date < ${to}::date OR ${!upperExclusive} AND t.due_date=${to}::date))
      ORDER BY CASE WHEN ${!deadlines} AND t.due_date=${from}::date THEN 0 ELSE 1 END,
        t.due_date ASC NULLS LAST, CASE WHEN ${deadlines} THEN t.due_time ELSE NULL END ASC NULLS FIRST,
        CASE WHEN ${!deadlines} THEN CASE t.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END ELSE 0 END,t.id
      LIMIT ${w.limit + 1}`,
        w.limit,
      ),
    };
  }
}
