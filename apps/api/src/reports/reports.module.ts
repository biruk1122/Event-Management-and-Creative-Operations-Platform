import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { EventsModule } from "../events/events.module.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { ReportsRepository } from "./infrastructure/reports.repository.js";
import { ReportsController } from "./reports.controller.js";
import { ReportsService } from "./reports.service.js";

@Module({
  imports: [
    AuditModule,
    AuthModule,
    EventsModule,
    ExpensesModule,
    PermissionsModule,
    ProjectsModule,
    TasksModule,
    WorkspacesModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository],
  exports: [ReportsService],
})
export class ReportsModule {}
