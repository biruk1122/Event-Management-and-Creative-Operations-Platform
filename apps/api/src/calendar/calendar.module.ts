import { Module } from "@nestjs/common";
import { CalendarDashboardQuery } from "./calendar-dashboard.query.js";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { CalendarController } from "./calendar.controller.js";
import { CalendarService } from "./calendar.service.js";
import { CalendarRepository } from "./infrastructure/calendar.repository.js";

@Module({
  exports: [CalendarDashboardQuery],
  imports: [AuthModule, PermissionsModule],
  controllers: [CalendarController],
  providers: [CalendarDashboardQuery, CalendarService, CalendarRepository],
})
export class CalendarModule {}
