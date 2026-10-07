import { Module } from "@nestjs/common";
import { UsersDashboardQuery } from "./users-dashboard.query.js";
import { UsersAnalyticsQuery } from "./users-analytics.query.js";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { UsersRepository } from "./infrastructure/users.repository.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

@Module({
  imports: [AuthModule, PermissionsModule],
  controllers: [UsersController],
  providers: [
    UsersDashboardQuery,
    UsersService,
    UsersRepository,
    UsersAnalyticsQuery,
  ],
  exports: [UsersDashboardQuery, UsersAnalyticsQuery],
})
export class UsersModule {}
