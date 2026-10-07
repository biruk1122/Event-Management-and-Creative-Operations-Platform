import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { DepartmentsModule } from "../departments/departments.module.js";
import { UsersModule } from "../users/users.module.js";
import { EventsModule } from "../events/events.module.js";
import { CampaignsModule } from "../campaigns/campaigns.module.js";
import { PromotionModule } from "../promotion/promotion.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { ProductionsModule } from "../productions/productions.module.js";
import { AnalyticsService } from "./analytics.service.js";
import { AnalyticsController } from "./analytics.controller.js";

@Module({
  exports: [AnalyticsService],
  imports: [
    AuthModule,
    PermissionsModule,
    TasksModule,
    DepartmentsModule,
    UsersModule,
    EventsModule,
    CampaignsModule,
    PromotionModule,
    ProjectsModule,
    ProductionsModule,
  ],
  providers: [AnalyticsService],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
