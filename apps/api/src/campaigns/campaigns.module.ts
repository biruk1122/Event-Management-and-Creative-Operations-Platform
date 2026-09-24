import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { CampaignsController } from "./campaigns.controller.js";
import { CampaignsService } from "./campaigns.service.js";
import { CampaignsRepository } from "./infrastructure/campaigns.repository.js";

@Module({
  imports: [AuthModule, PermissionsModule, WorkspacesModule],
  controllers: [CampaignsController],
  exports: [CampaignsService],
  providers: [CampaignsService, CampaignsRepository],
})
export class CampaignsModule {}
