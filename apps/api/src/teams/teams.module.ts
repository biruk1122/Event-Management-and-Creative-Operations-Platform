import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { TeamsController } from "./teams.controller.js";
import { TeamsService } from "./teams.service.js";
import { TeamsRepository } from "./infrastructure/teams.repository.js";

@Module({
  imports: [AuthModule, PermissionsModule],
  controllers: [TeamsController],
  providers: [TeamsService, TeamsRepository],
})
export class TeamsModule {}
