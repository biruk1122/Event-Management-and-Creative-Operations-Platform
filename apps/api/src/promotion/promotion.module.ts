import { TalentModule } from "../talent/talent.module.js";
import { Module } from "@nestjs/common";
import { PromotionAnalyticsQuery } from "./promotion-analytics.query.js";

import { AuthModule } from "../auth/auth.module.js";
import { CampaignsModule } from "../campaigns/campaigns.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { PartnersModule } from "../partners/partners.module.js";
import { PromotionRepository } from "./infrastructure/promotion.repository.js";
import {
  PromotionActivitiesController,
  PromotionAssignableEmployeesController,
  PromotionController,
  PromotionWorkspaceController,
} from "./promotion.controller.js";
import { PromotionService } from "./promotion.service.js";

@Module({
  imports: [
    AuthModule,
    CampaignsModule,
    PartnersModule,
    PermissionsModule,
    TalentModule,
  ],
  controllers: [
    PromotionController,
    PromotionActivitiesController,
    PromotionAssignableEmployeesController,
    PromotionWorkspaceController,
  ],
  providers: [PromotionService, PromotionRepository, PromotionAnalyticsQuery],
  exports: [PromotionAnalyticsQuery],
})
export class PromotionModule {}
