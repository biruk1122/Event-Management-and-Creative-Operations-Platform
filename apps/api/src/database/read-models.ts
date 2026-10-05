import { Prisma } from "../generated/prisma/client.js";
import type { DatabaseService } from "./database.service.js";

export interface ReadPeriod {
  from: Date;
  toExclusive: Date;
}
export interface ReadPage {
  page: number;
  pageSize: number;
}
export interface Identity {
  id: string;
}
export interface IdPage<T extends Identity = Identity> {
  total: number;
  items: T[];
}
export interface WorkCounts {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
  percent: number | null;
}
export interface ProgressCounts {
  total: number;
  completed: number;
  percent: number | null;
}
export interface MonthlyCount {
  month: string;
  total: number;
}

/** SQL identifiers here are fixed by the owning module, never request values. */
export async function idPage<T extends Identity>(
  db: DatabaseService,
  table: Prisma.Sql,
  columns: Prisma.Sql,
  where: Prisma.Sql,
  page: ReadPage,
): Promise<IdPage<T>> {
  const [result] = await db.readModel<IdPage<T>>(Prisma.sql`
    WITH scoped AS (SELECT ${columns} FROM ${table} WHERE ${where}),
    selected AS (SELECT * FROM scoped ORDER BY id LIMIT ${page.pageSize} OFFSET ${(page.page - 1) * page.pageSize})
    SELECT (SELECT count(*)::int FROM scoped) AS total,
      coalesce((SELECT jsonb_agg(selected ORDER BY id) FROM selected), '[]'::jsonb) AS items`);
  return result!;
}

export function creationCounts(
  db: DatabaseService,
  table: Prisma.Sql,
  period: ReadPeriod,
): Promise<MonthlyCount[]> {
  return db.readModel<MonthlyCount>(Prisma.sql`
    SELECT to_char(date_trunc('month', created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
      count(*)::int AS total FROM ${table}
    WHERE created_at >= ${period.from} AND created_at < ${period.toExclusive}
    GROUP BY 1 ORDER BY 1`);
}

export function uuidSet(ids: readonly string[]): Prisma.Sql {
  // A single JSON parameter avoids the PostgreSQL bind-parameter ceiling for
  // trusted internal activity sets. Client filters are individual validated IDs.
  return Prisma.sql`SELECT value::uuid FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)`;
}
