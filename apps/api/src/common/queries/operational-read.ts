import { Prisma } from "../../generated/prisma/client.js";
import type { EffectiveGrant } from "../security/permissions.service.js";
import { permissionDenied } from "../security/security.errors.js";
import type { DatabaseService } from "../../database/database.service.js";

export interface ReadContext {
  userId: string;
  grants: EffectiveGrant[];
  departmentId: string | null;
  selfOnly: boolean;
}
export interface ReadWindow {
  from: Date;
  to: Date;
  asOf: Date;
  limit: number;
}
export interface OperationalItem {
  id: string;
  title: string;
  kind: string;
  status?: string;
  startAt?: string | null;
  endAt?: string | null;
  dueAt?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  attentionReasons?: string[];
  taskId?: string;
  activityType?: string;
  occurredAt?: string;
}
export interface OperationalList {
  items: OperationalItem[];
  hasMore: boolean;
  count?: number;
}
export type ReadScope = "organization" | "department" | "self";
export interface ScopedRead<T> {
  scope: ReadScope;
  data: T;
}

/** Trusted application context, never a client-supplied scope. */
export function sourceScope(
  ctx: ReadContext,
  key: string,
  allowed: ReadScope[],
): ReadScope {
  const has = (scope: string) =>
    ctx.grants.some((g) => g.permissionKey === key && g.scope === scope);
  if (has("ORGANIZATION") && allowed.includes("organization"))
    return "organization";
  if (has("DEPARTMENT") && allowed.includes("department")) return "department";
  if (has("SELF") && allowed.includes("self")) return "self";
  throw permissionDenied();
}
/** Owner supplies only fixed SQL fragments and parameterized values. */
export async function operationalList(
  db: DatabaseService,
  query: Prisma.Sql,
  limit: number,
): Promise<OperationalList> {
  const rows = await db.readModel<{ item: OperationalItem }>(query);
  return {
    items: rows.slice(0, limit).map((row) => row.item),
    hasMore: rows.length > limit,
  };
}
export function overlaps(
  start: Prisma.Sql,
  end: Prisma.Sql,
  w: ReadWindow,
): Prisma.Sql {
  return Prisma.sql`(${start} >= ${w.from} AND ${start} < ${w.to} OR
    ${end} IS NOT NULL AND ${start} < ${w.to} AND ${end} > ${w.from})`;
}
