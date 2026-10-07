import { Module } from "@nestjs/common";
import { TalentDashboardQuery } from "./talent-dashboard.query.js";
import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { TalentController } from "./talent.controller.js";
import { TalentService } from "./talent.service.js";
import { TalentRepository } from "./infrastructure/talent.repository.js";
@Module({
  imports: [AuthModule, PermissionsModule],
  controllers: [TalentController],
  providers: [TalentDashboardQuery, TalentService, TalentRepository],
  exports: [TalentDashboardQuery, TalentService],
})
export class TalentModule {}
