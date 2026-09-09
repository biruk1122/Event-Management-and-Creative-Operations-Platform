import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { WorkspacesController } from "./workspaces.controller.js";
import { WorkspacesService } from "./workspaces.service.js";
import { WorkspacesRepository } from "./infrastructure/workspaces.repository.js";

@Module({
  imports: [AuthModule, PermissionsModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspacesRepository],
  // The events module reuses the repository for manager and team composition on
  // an event's connected workspace; the composition logic stays owned here.
  exports: [WorkspacesRepository],
})
export class WorkspacesModule {}
