import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { CampaignsModule } from "../campaigns/campaigns.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { MarketingRepository } from "./infrastructure/marketing.repository.js";
import { MarketingController } from "./marketing.controller.js";
import { MarketingService } from "./marketing.service.js";

@Module({
  imports: [AuthModule, CampaignsModule, PermissionsModule],
  controllers: [MarketingController],
  providers: [MarketingService, MarketingRepository],
})
export class MarketingModule {}
