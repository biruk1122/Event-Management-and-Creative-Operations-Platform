import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { RealtimeModule } from "../realtime/realtime.module.js";
import { NotificationsRepository } from "./infrastructure/notifications.repository.js";
import { NotificationsRelayService } from "./notifications-relay.service.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";

@Module({
  imports: [AuthModule, OutboxModule, PermissionsModule, RealtimeModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    NotificationsService,
    NotificationsRelayService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
