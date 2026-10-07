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
export class ProjectsDashboardQuery {
  constructor(private readonly db: DatabaseService) {}
  async counts(ctx: ReadContext) {
    const scope = sourceScope(ctx, "project.read", ["organization"]);
    const [data] = await this.db.readModel<{
      activeProjects: number;
    }>(Prisma.sql`
      SELECT count(*) FILTER (WHERE e.status=\'ACTIVE\')::int AS "activeProjects"
      FROM projects e`);
    return { scope, data: data! };
  }
  async list(ctx: ReadContext, deadline: boolean, w: ReadWindow) {
    const scope = sourceScope(ctx, "project.read", ["organization"]);
    const assigned = Prisma.sql`EXISTS (SELECT 1 FROM workspaces s WHERE s.id=e.workspace_id AND
      (s.manager_id=${ctx.userId}::uuid OR EXISTS (SELECT 1 FROM workspace_participants p WHERE p.workspace_id=s.id AND p.user_id=${ctx.userId}::uuid)
      OR EXISTS (SELECT 1 FROM workspace_teams wt JOIN team_memberships tm ON tm.team_id=wt.team_id WHERE wt.workspace_id=s.id AND tm.user_id=${ctx.userId}::uuid)))`;
    const visible = ctx.selfOnly ? assigned : Prisma.sql`true`;
    const time = deadline
      ? Prisma.sql`e.end_at >= ${w.from} AND e.end_at < ${w.to}`
      : overlaps(Prisma.sql`e.start_at`, Prisma.sql`e.end_at`, w);
    return {
      scope: ctx.selfOnly ? ("self" as const) : scope,
      data: await operationalList(
        this.db,
        Prisma.sql`
      SELECT jsonb_build_object('id',e.id,'title',e.name,'kind','PROJECT','status',e.status,
        'startAt',e.start_at,'endAt',e.end_at,'dueAt',e.end_at) AS item
      FROM projects e WHERE e.status NOT IN ('COMPLETED','CANCELLED') AND ${visible} AND ${time}
      ORDER BY ${deadline ? Prisma.sql`e.end_at` : Prisma.sql`e.start_at`},e.id LIMIT ${w.limit + 1}`,
        w.limit,
      ),
    };
  }
}
