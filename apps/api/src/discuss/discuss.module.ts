import { Module } from "@nestjs/common";
import { DiscussDashboardQuery } from "./discuss-dashboard.query.js";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { RealtimeModule } from "../realtime/realtime.module.js";
import { DiscussController } from "./discuss.controller.js";
import { DiscussService } from "./discuss.service.js";
import { DiscussRepository } from "./infrastructure/discuss.repository.js";

@Module({
  imports: [AuthModule, OutboxModule, PermissionsModule, RealtimeModule],
  controllers: [DiscussController],
  providers: [DiscussDashboardQuery, DiscussRepository, DiscussService],
  exports: [DiscussDashboardQuery, DiscussService],
})
export class DiscussModule {}
