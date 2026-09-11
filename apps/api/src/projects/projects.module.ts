import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { ProjectsController } from "./projects.controller.js";
import { ProjectsService } from "./projects.service.js";
import { ProjectsRepository } from "./infrastructure/projects.repository.js";

@Module({
  imports: [AuthModule, PermissionsModule, WorkspacesModule],
  controllers: [ProjectsController],
  exports: [ProjectsRepository],
  providers: [ProjectsService, ProjectsRepository],
})
export class ProjectsModule {}
