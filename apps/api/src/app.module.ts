import { randomUUID } from "node:crypto";

import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";

import { AuthModule } from "./auth/auth.module.js";
import { CalendarModule } from "./calendar/calendar.module.js";
import { CampaignsModule } from "./campaigns/campaigns.module.js";
import { environment } from "./config/environment.js";
import { EnvironmentModule } from "./config/environment.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { DepartmentsModule } from "./departments/departments.module.js";
import { DiscussModule } from "./discuss/discuss.module.js";
import { EventsModule } from "./events/events.module.js";
import { FileManagementModule } from "./file-management/file-management.module.js";
import { HealthModule } from "./health/health.module.js";
import { MeetingsModule } from "./meetings/meetings.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { ProjectsModule } from "./projects/projects.module.js";
import { RbacModule } from "./rbac/rbac.module.js";
import { RealtimeModule } from "./realtime/realtime.module.js";
import { TeamsModule } from "./teams/teams.module.js";
import { TalentModule } from "./talent/talent.module.js";
import { TasksModule } from "./tasks/tasks.module.js";
import { TodoModule } from "./todo/todo.module.js";
import { UsersModule } from "./users/users.module.js";
import { WorkspacesModule } from "./workspaces/workspaces.module.js";

@Module({
  imports: [
    EnvironmentModule,
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: {
          ignore: (request) => request.url === "/health/live",
        },
        genReqId: (request, response) => {
          const incomingId = request.headers["x-request-id"];
          const requestId =
            (Array.isArray(incomingId) ? incomingId[0] : incomingId)?.trim() ||
            randomUUID();
          response.setHeader("x-request-id", requestId);
          return requestId;
        },
        level: environment.LOG_LEVEL,
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "res.headers.set-cookie",
          ],
          censor: "[REDACTED]",
        },
      },
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    MeetingsModule,
    CalendarModule,
    RbacModule,
    UsersModule,
    DepartmentsModule,
    TeamsModule,
    TasksModule,
    WorkspacesModule,
    EventsModule,
    TalentModule,
    ProjectsModule,
    CampaignsModule,
    DiscussModule,
    FileManagementModule,
    RealtimeModule,
    NotificationsModule,
    TodoModule,
  ],
})
export class AppModule {}
