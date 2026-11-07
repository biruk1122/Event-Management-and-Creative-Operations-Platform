import { TalentModule } from "../talent/talent.module.js";
import { Module } from "@nestjs/common";
import { EventsDashboardQuery } from "./events-dashboard.query.js";
import { EventsAnalyticsQuery } from "./events-analytics.query.js";
import { EventsReportFactsQuery } from "./events-report-facts.query.js";

import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { EventsController } from "./events.controller.js";
import { EventsSchedulerService } from "./events-scheduler.service.js";
import { EventsService } from "./events.service.js";
import { EventsRepository } from "./infrastructure/events.repository.js";
import { EventsSchedulerRepository } from "./infrastructure/events-scheduler.repository.js";

@Module({
  imports: [
    AuditModule,
    AuthModule,
    OutboxModule,
    PermissionsModule,
    TalentModule,
    WorkspacesModule,
  ],
  controllers: [EventsController],
  exports: [
    EventsDashboardQuery,
    EventsRepository,
    EventsAnalyticsQuery,
    EventsReportFactsQuery,
    EventsService,
  ],
  providers: [
    EventsDashboardQuery,
    EventsService,
    EventsRepository,
    EventsAnalyticsQuery,
    EventsReportFactsQuery,
    EventsSchedulerRepository,
    EventsSchedulerService,
  ],
})
export class EventsModule {}
