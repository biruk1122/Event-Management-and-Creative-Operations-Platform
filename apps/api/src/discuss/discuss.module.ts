import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { DiscussController } from "./discuss.controller.js";
import { DiscussService } from "./discuss.service.js";
import { DiscussRepository } from "./infrastructure/discuss.repository.js";

@Module({
  imports: [AuthModule, OutboxModule, PermissionsModule],
  controllers: [DiscussController],
  providers: [DiscussRepository, DiscussService],
  exports: [DiscussService],
})
export class DiscussModule {}
