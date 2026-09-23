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
  // Owning modules use the application service for authorized composition.
  // The repository remains exported for existing event/project/campaign callers
  // until those modules are migrated in their own scoped changes.
  exports: [WorkspacesService, WorkspacesRepository],
})
export class WorkspacesModule {}
