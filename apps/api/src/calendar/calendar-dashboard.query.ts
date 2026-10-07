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
export class CalendarDashboardQuery {
  constructor(private readonly db: DatabaseService) {}
  async list(ctx: ReadContext, w: ReadWindow) {
    sourceScope(ctx, "calendar.read", ["organization", "self"]);
    return {
      scope: "self" as const,
      data: await operationalList(
        this.db,
        Prisma.sql`
      SELECT jsonb_build_object('id',c.id,'title',c.title,'kind',c.type,'startAt',c.start_at,'endAt',c.end_at) AS item
      FROM calendar_entries c WHERE c.user_id=${ctx.userId}::uuid AND c.type IN ('PERSONAL','REMINDER')
      AND ${overlaps(Prisma.sql`c.start_at`, Prisma.sql`c.end_at`, w)}
      ORDER BY c.start_at,c.id LIMIT ${w.limit + 1}`,
        w.limit,
      ),
    };
  }
}
