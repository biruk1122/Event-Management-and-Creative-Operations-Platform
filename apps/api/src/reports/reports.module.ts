import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { EventsModule } from "../events/events.module.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { SmsModule } from "../sms/sms.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { ReportsRepository } from "./infrastructure/reports.repository.js";
import { ReportsSchedulerRepository } from "./infrastructure/reports-scheduler.repository.js";
import { CampaignsModule } from "../campaigns/campaigns.module.js";
import { ReportsController } from "./reports.controller.js";
import { ReportsSchedulerService } from "./reports-scheduler.service.js";
import { ReportsService } from "./reports.service.js";
import { ReportsSmsService } from "./reports-sms.service.js";

@Module({
  imports: [
    AuditModule,
    AuthModule,
    CampaignsModule,
    EventsModule,
    ExpensesModule,
    OutboxModule,
    PermissionsModule,
    ProjectsModule,
    SmsModule,
    TasksModule,
    WorkspacesModule,
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportsRepository,
    ReportsSchedulerRepository,
    ReportsSchedulerService,
    ReportsSmsService,
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
