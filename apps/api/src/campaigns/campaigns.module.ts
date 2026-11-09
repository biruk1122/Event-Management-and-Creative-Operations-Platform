import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { CampaignsDashboardQuery } from "./campaigns-dashboard.query.js";
import { CampaignsAnalyticsQuery } from "./campaigns-analytics.query.js";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { EventsModule } from "../events/events.module.js";
import { TalentModule } from "../talent/talent.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { CampaignsController } from "./campaigns.controller.js";
import { CampaignsService } from "./campaigns.service.js";
import { CampaignsRepository } from "./infrastructure/campaigns.repository.js";

@Module({
  imports: [
    AuditModule,
    AuthModule,
    EventsModule,
    PermissionsModule,
    TalentModule,
    WorkspacesModule,
  ],
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
