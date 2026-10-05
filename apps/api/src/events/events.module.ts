import { Module } from "@nestjs/common";
import { EventsAnalyticsQuery } from "./events-analytics.query.js";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { EventsController } from "./events.controller.js";
import { EventsService } from "./events.service.js";
import { EventsRepository } from "./infrastructure/events.repository.js";

@Module({
  imports: [AuthModule, PermissionsModule, WorkspacesModule],
  controllers: [EventsController],
  exports: [EventsRepository, EventsAnalyticsQuery],
  providers: [EventsService, EventsRepository, EventsAnalyticsQuery],
})
export class EventsModule {}
