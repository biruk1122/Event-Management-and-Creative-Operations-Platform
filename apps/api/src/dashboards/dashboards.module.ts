import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { EventsModule } from "../events/events.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { CampaignsModule } from "../campaigns/campaigns.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { MeetingsModule } from "../meetings/meetings.module.js";
import { TodoModule } from "../todo/todo.module.js";
import { CalendarModule } from "../calendar/calendar.module.js";
import { DiscussModule } from "../discuss/discuss.module.js";
import { UsersModule } from "../users/users.module.js";
import { TalentModule } from "../talent/talent.module.js";
import { DashboardsController } from "./dashboards.controller.js";
import { DashboardsService } from "./dashboards.service.js";
@Module({
  imports: [
    AuthModule,
    PermissionsModule,
    AnalyticsModule,
    EventsModule,
    ProjectsModule,
    CampaignsModule,
    TasksModule,
    MeetingsModule,
    TodoModule,
    CalendarModule,
    DiscussModule,
    UsersModule,
    TalentModule,
  ],
  controllers: [DashboardsController],
  providers: [DashboardsService],
})
export class DashboardsModule {}
