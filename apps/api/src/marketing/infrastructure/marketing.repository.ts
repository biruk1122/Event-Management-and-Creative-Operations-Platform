import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../../database/database.service.js";

/** Marketing owns only the strategy extension, never shared campaign tables. */
@Injectable()
export class MarketingRepository {
  constructor(private readonly db: DatabaseService) {}

  find(campaignId: string) {
    return this.db.marketingCampaign.findUnique({ where: { campaignId } });
  }

  create(campaignId: string, strategy: string) {
    return this.db.marketingCampaign.create({
      data: { campaignId, strategy },
    });
  }

  async update(campaignId: string, strategy: string) {
    const result = await this.db.marketingCampaign.updateMany({
      where: { campaignId },
      data: { strategy },
    });
    return result.count ? this.find(campaignId) : null;
  }

  async remove(campaignId: string) {
    const result = await this.db.marketingCampaign.deleteMany({
      where: { campaignId },
    });
    return result.count > 0;
  }
}
