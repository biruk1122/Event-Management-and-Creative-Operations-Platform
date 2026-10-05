import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import {
  creationCounts,
  uuidSet,
  type MonthlyCount,
  type ReadPeriod,
  type ProgressCounts,
  type WorkCounts,
} from "../database/read-models.js";
import { Prisma } from "../generated/prisma/client.js";

const COUNTS = Prisma.sql`count(*)::int AS total,
  count(*) FILTER (WHERE t.status = 'COMPLETED')::int AS completed,
  count(*) FILTER (WHERE t.status <> 'COMPLETED')::int AS pending`;
const EMPTY: WorkCounts = {
  total: 0,
  completed: 0,
  pending: 0,
  overdue: 0,
  percent: null,
};

/** Tasks owns all status, assignment and completion-history projections. */
@Injectable()
export class TasksAnalyticsQuery {
  constructor(private readonly db: DatabaseService) {}
  private counts(asOf: Date) {
    return Prisma.sql`${COUNTS}, count(*) FILTER (WHERE t.status <> 'COMPLETED' AND t.due_at < ${asOf})::int AS overdue,
      round(100.0 * count(*) FILTER (WHERE t.status = 'COMPLETED') / nullif(count(*), 0))::int AS percent`;
  }
  private cohort(period: ReadPeriod) {
    return Prisma.sql`t.status <> 'CANCELLED' AND t.created_at >= ${period.from} AND t.created_at < ${period.toExclusive}`;
  }
  async organization(period: ReadPeriod, asOf: Date): Promise<WorkCounts> {
    const [row] = await this.db.readModel<WorkCounts>(
      Prisma.sql`SELECT ${this.counts(asOf)} FROM tasks t WHERE ${this.cohort(period)}`,
    );
    return row!;
  }
  async departments(ids: string[], period: ReadPeriod, asOf: Date) {
    if (!ids.length) return [];
    const rows = await this.db.readModel<
      WorkCounts & { id: string }
    >(Prisma.sql`
      SELECT t.department_id AS id, ${this.counts(asOf)} FROM tasks t
      WHERE t.department_id IN (${uuidSet(ids)}) AND ${this.cohort(period)} GROUP BY t.department_id`);
    return ids.map(
      (id) => rows.find((row) => row.id === id) ?? { id, ...EMPTY },
    );
  }
  async employees(ids: string[], period: ReadPeriod, asOf: Date) {
    if (!ids.length) return [];
    const rows = await this.db.readModel<
      WorkCounts & { id: string }
    >(Prisma.sql`
      SELECT a.user_id AS id, ${this.counts(asOf)} FROM task_assignments a JOIN tasks t ON t.id = a.task_id
      WHERE a.user_id IN (${uuidSet(ids)}) AND ${this.cohort(period)} GROUP BY a.user_id`);
    return ids.map(
      (id) => rows.find((row) => row.id === id) ?? { id, ...EMPTY },
    );
  }
  async workspaceProgress(
    ids: string[],
  ): Promise<Array<ProgressCounts & { id: string }>> {
    if (!ids.length) return [];
    const rows = await this.db.readModel<
      ProgressCounts & { id: string }
    >(Prisma.sql`
      SELECT workspace_id AS id, count(*)::int AS total,
        count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
        round(100.0 * count(*) FILTER (WHERE status = 'COMPLETED') / nullif(count(*), 0))::int AS percent
      FROM tasks WHERE workspace_id IN (${uuidSet(ids)}) AND status <> 'CANCELLED' GROUP BY workspace_id`);
    return ids.map(
      (id) =>
        rows.find((row) => row.id === id) ?? {
          id,
          total: 0,
          completed: 0,
          percent: null,
        },
    );
  }
  creation(period: ReadPeriod) {
    return creationCounts(this.db, Prisma.sql`tasks`, period);
  }
  completions(period: ReadPeriod): Promise<MonthlyCount[]> {
    return this.db.readModel<MonthlyCount>(Prisma.sql`
      SELECT to_char(date_trunc('month', occurred_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
        count(DISTINCT task_id)::int AS total FROM task_activities
      WHERE occurred_at >= ${period.from} AND occurred_at < ${period.toExclusive}
        AND type = 'STATUS_CHANGED' AND details ->> 'to' = 'COMPLETED' GROUP BY 1 ORDER BY 1`);
  }
}
