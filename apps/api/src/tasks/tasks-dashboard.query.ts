import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  operationalList,
  overlaps,
  sourceScope,
  type ReadContext,
  type ReadWindow,
} from "../common/queries/operational-read.js";
const pending = Prisma.sql`t.status IN ('TODO','IN_PROGRESS','UNDER_REVIEW','BLOCKED')`;
@Injectable()
export class TasksDashboardQuery {
  constructor(private readonly db: DatabaseService) {}
  async counts(ctx: ReadContext, now: Date) {
    const scope = sourceScope(ctx, "task.read", ["organization"]);
    const [data] = await this.db.readModel<{
      pendingTasks: number;
      completedTasks: number;
      overdueTasks: number;
    }>(Prisma.sql`
      SELECT count(*) FILTER (WHERE ${pending})::int AS "pendingTasks",
      count(*) FILTER (WHERE t.status = 'COMPLETED')::int AS "completedTasks",
      count(*) FILTER (WHERE ${pending} AND t.due_at < ${now})::int AS "overdueTasks" FROM tasks t`);
    return { scope, data: data! };
  }
  async list(
    ctx: ReadContext,
    mode: "attention" | "tasks" | "deadlines" | "schedule" | "activity",
    w: ReadWindow,
  ) {
    const scope = sourceScope(ctx, "task.read", [
      "organization",
      "department",
      "self",
    ]);
    const assigned = Prisma.sql`EXISTS (SELECT 1 FROM task_assignments a WHERE a.task_id=t.id AND a.user_id=${ctx.userId}::uuid)`;
    const authorized =
      scope === "organization"
        ? Prisma.sql`true`
        : scope === "self"
          ? Prisma.sql`(t.created_by_id=${ctx.userId}::uuid OR ${assigned})`
          : Prisma.sql`(t.department_id=${ctx.departmentId}::uuid OR
        ${ctx.grants.some((g) => g.permissionKey === "task.read" && g.scope === "SELF")} AND (t.created_by_id=${ctx.userId}::uuid OR ${assigned}))`;
    const visible =
      ctx.selfOnly || mode === "activity"
        ? Prisma.sql`${authorized} AND ${assigned}`
        : authorized;
    if (mode === "activity") {
      const data = await operationalList(
        this.db,
        Prisma.sql`
        SELECT jsonb_build_object('id',a.id,'kind','TASK_ACTIVITY','title',t.title,'taskId',t.id,
          'activityType',a.type,'occurredAt',a.occurred_at) AS item
        FROM task_activities a JOIN tasks t ON t.id=a.task_id
        WHERE ${visible} AND a.occurred_at >= ${new Date(w.asOf.getTime() - 7 * 86400000)} AND a.occurred_at <= ${w.asOf}
        ORDER BY a.occurred_at DESC,a.id DESC LIMIT ${w.limit + 1}`,
        w.limit,
      );
      return { scope: ctx.selfOnly ? ("self" as const) : scope, data };
    }
    const filter =
      mode === "attention"
        ? Prisma.sql`${pending} AND (t.due_at < ${w.asOf} OR t.status IN ('BLOCKED','UNDER_REVIEW'))`
        : mode === "deadlines"
          ? Prisma.sql`${pending} AND t.due_at >= ${w.from} AND t.due_at < ${w.to}`
          : mode === "schedule"
            ? Prisma.sql`${pending} AND ${overlaps(Prisma.sql`t.start_at`, Prisma.sql`t.due_at`, w)}`
            : pending;
    const order =
      mode === "attention"
        ? Prisma.sql`CASE WHEN t.due_at < ${w.asOf} THEN 0 WHEN t.status='BLOCKED' THEN 1 ELSE 2 END,t.due_at ASC NULLS LAST,t.id`
        : mode === "tasks"
          ? Prisma.sql`CASE WHEN t.due_at < ${w.asOf} THEN 0 ELSE 1 END,t.due_at ASC NULLS LAST,t.id`
          : mode === "schedule"
            ? Prisma.sql`t.start_at,t.id`
            : Prisma.sql`t.due_at,t.id`;
    const data = await operationalList(
      this.db,
      Prisma.sql`
      SELECT jsonb_build_object('id',t.id,'title',t.title,'kind','TASK','status',t.status,
        'startAt',t.start_at,'dueAt',t.due_at,
        'attentionReasons',array_remove(ARRAY[
          CASE WHEN ${pending} AND t.due_at < ${w.asOf} THEN 'OVERDUE' END,
          CASE WHEN t.status='BLOCKED' THEN 'BLOCKED' END,
          CASE WHEN t.status='UNDER_REVIEW' THEN 'UNDER_REVIEW' END],NULL)) AS item
      FROM tasks t WHERE ${visible} AND ${filter}
      ORDER BY ${order} LIMIT ${w.limit + 1}`,
      w.limit,
    );
    return { scope: ctx.selfOnly ? ("self" as const) : scope, data };
  }
}
