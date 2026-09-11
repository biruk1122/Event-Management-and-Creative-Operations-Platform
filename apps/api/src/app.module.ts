import { randomUUID } from "node:crypto";

import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";

import { AuthModule } from "./auth/auth.module.js";
import { environment } from "./config/environment.js";
import { EnvironmentModule } from "./config/environment.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { DepartmentsModule } from "./departments/departments.module.js";
import { EventsModule } from "./events/events.module.js";
import { FileManagementModule } from "./file-management/file-management.module.js";
import { HealthModule } from "./health/health.module.js";
import { RbacModule } from "./rbac/rbac.module.js";
import { TeamsModule } from "./teams/teams.module.js";
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
    RbacModule,
    UsersModule,
    DepartmentsModule,
    TeamsModule,
    WorkspacesModule,
    EventsModule,
    FileManagementModule,
  ],
})
export class AppModule {}
