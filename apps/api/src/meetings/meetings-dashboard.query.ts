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
@Injectable()
export class MeetingsDashboardQuery {
  constructor(private readonly db: DatabaseService) {}
  async list(ctx: ReadContext, upcoming: boolean, w: ReadWindow) {
    const scope = sourceScope(ctx, "meeting.read", [
      "organization",
      "department",
      "self",
    ]);
    const own = Prisma.sql`(m.organizer_id=${ctx.userId}::uuid OR EXISTS (
      SELECT 1 FROM meeting_participants p WHERE p.meeting_id=m.id AND p.user_id=${ctx.userId}::uuid
      AND (${!(ctx.selfOnly && upcoming)} OR p.response IN ('PENDING','ACCEPTED'))))`;
    const department = Prisma.sql`(EXISTS (SELECT 1 FROM users u WHERE u.id=m.organizer_id AND u.department_id=${ctx.departmentId}::uuid)
      OR EXISTS (SELECT 1 FROM meeting_participants p JOIN users u ON u.id=p.user_id WHERE p.meeting_id=m.id AND u.department_id=${ctx.departmentId}::uuid))`;
    const authorized =
      scope === "self"
        ? own
        : scope === "organization"
          ? Prisma.sql`true`
          : Prisma.sql`(${department} OR ${ctx.grants.some((g) => g.permissionKey === "meeting.read" && g.scope === "SELF")} AND ${own})`;
    const visible = ctx.selfOnly
      ? Prisma.sql`${authorized} AND ${own}`
      : authorized;
    const time = upcoming
      ? Prisma.sql`m.start_at >= ${w.from} AND m.start_at < ${w.to}`
      : overlaps(Prisma.sql`m.start_at`, Prisma.sql`m.end_at`, w);
    return {
      scope: ctx.selfOnly ? ("self" as const) : scope,
      data: await operationalList(
        this.db,
        Prisma.sql`
      SELECT jsonb_build_object('id',m.id,'title',m.title,'kind','MEETING','status',m.status,'startAt',m.start_at,'endAt',m.end_at) AS item
      FROM meetings m WHERE m.status='SCHEDULED' AND ${visible} AND ${time}
      ORDER BY m.start_at,m.id LIMIT ${w.limit + 1}`,
        w.limit,
      ),
    };
  }
}
