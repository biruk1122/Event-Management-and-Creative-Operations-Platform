import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { CampaignsModule } from "../campaigns/campaigns.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { PromotionRepository } from "./infrastructure/promotion.repository.js";
import { PromotionController } from "./promotion.controller.js";
import { PromotionService } from "./promotion.service.js";

@Module({
  imports: [AuthModule, CampaignsModule, PermissionsModule],
  controllers: [PromotionController],
  providers: [PromotionService, PromotionRepository],
})
export class PromotionModule {}
