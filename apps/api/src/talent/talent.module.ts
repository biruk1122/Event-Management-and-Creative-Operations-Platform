import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { TalentController } from "./talent.controller.js";
import { TalentService } from "./talent.service.js";
import { TalentRepository } from "./infrastructure/talent.repository.js";
@Module({
  imports: [AuthModule, PermissionsModule],
  controllers: [TalentController],
  providers: [TalentService, TalentRepository],
  exports: [TalentService],
})
export class TalentModule {}
