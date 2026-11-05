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
export class CampaignsDashboardQuery {
  constructor(private readonly db: DatabaseService) {}
  async count(ctx: ReadContext) {
    const scope = sourceScope(ctx, "campaign.read", ["organization"]);
    const [data] = await this.db.readModel<{ count: number }>(
      Prisma.sql`SELECT count(*)::int AS count FROM campaigns WHERE status='ACTIVE' AND archived_at IS NULL`,
    );
    return { scope, data: data! };
  }
  async overdue(ctx: ReadContext, w: ReadWindow) {
    const scope = sourceScope(ctx, "campaign.read", ["organization"]);
    return {
      scope,
      data: await operationalList(
        this.db,
        Prisma.sql`
   SELECT jsonb_build_object('id',a.id,'title',a.name,'kind','CAMPAIGN_ACTIVITY','status',a.status,'endAt',a.end_at) AS item
   FROM campaign_activities a JOIN campaigns c ON c.id = a.campaign_id WHERE a.archived_at IS NULL AND c.archived_at IS NULL AND a.status IN ('PLANNED','IN_PROGRESS') AND a.end_at < ${w.asOf}
   ORDER BY a.end_at,a.id LIMIT ${w.limit + 1}`,
        w.limit,
      ),
    };
  }
}
