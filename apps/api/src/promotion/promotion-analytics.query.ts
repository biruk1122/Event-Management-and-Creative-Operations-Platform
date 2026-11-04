import { Injectable } from "@nestjs/common";
import { CampaignsAnalyticsQuery } from "../campaigns/campaigns-analytics.query.js";
import { DatabaseService } from "../database/database.service.js";
import { Prisma, type PromotionChannel } from "../generated/prisma/client.js";

@Injectable()
export class PromotionAnalyticsQuery {
  constructor(
    private readonly db: DatabaseService,
    private readonly campaigns: CampaignsAnalyticsQuery,
  ) {}
  async channels(campaignId: string) {
    const extensions = await this.db.readModel<{
      channel: PromotionChannel;
      ids: string[];
    }>(Prisma.sql`
      SELECT channel, array_agg(campaign_activity_id ORDER BY campaign_activity_id) AS ids
      FROM promotion_activities JOIN campaign_activities a ON a.id = promotion_activities.campaign_activity_id WHERE promotion_activities.campaign_id = ${campaignId}::uuid AND a.archived_at IS NULL GROUP BY channel ORDER BY channel`);
    const rows = await Promise.all(
      extensions.map(async (extension) => ({
        channel: extension.channel,
        ...(await this.campaigns.activityProgress(campaignId, extension.ids)),
      })),
    );
    return rows.filter((row) => row.total > 0);
  }
}
