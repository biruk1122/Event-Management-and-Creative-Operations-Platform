import { Module } from "@nestjs/common";
import { CampaignsDashboardQuery } from "./campaigns-dashboard.query.js";
import { CampaignsAnalyticsQuery } from "./campaigns-analytics.query.js";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { CampaignsController } from "./campaigns.controller.js";
import { CampaignsService } from "./campaigns.service.js";
import { CampaignsRepository } from "./infrastructure/campaigns.repository.js";

@Module({
  imports: [AuthModule, PermissionsModule, WorkspacesModule],
  controllers: [CampaignsController],
  exports: [CampaignsDashboardQuery, CampaignsService, CampaignsAnalyticsQuery],
  providers: [
    CampaignsDashboardQuery,
    CampaignsService,
    CampaignsRepository,
    CampaignsAnalyticsQuery,
  ],
})
export class CampaignsModule {}
