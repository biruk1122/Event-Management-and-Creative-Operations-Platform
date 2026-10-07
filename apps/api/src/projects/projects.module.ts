import { Module } from "@nestjs/common";
import { ProjectsDashboardQuery } from "./projects-dashboard.query.js";
import { ProjectsAnalyticsQuery } from "./projects-analytics.query.js";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { ProjectsController } from "./projects.controller.js";
import { ProjectsService } from "./projects.service.js";
import { ProjectsRepository } from "./infrastructure/projects.repository.js";
import { ProjectsReportFactsQuery } from "./projects-report-facts.query.js";

@Module({
  imports: [AuthModule, PermissionsModule, WorkspacesModule],
  controllers: [ProjectsController],
  exports: [
    ProjectsDashboardQuery,
    ProjectsRepository,
    ProjectsReportFactsQuery,
    ProjectsAnalyticsQuery,
  ],
  providers: [
    ProjectsDashboardQuery,
    ProjectsService,
    ProjectsRepository,
    ProjectsReportFactsQuery,
    ProjectsAnalyticsQuery,
  ],
})
export class ProjectsModule {}
