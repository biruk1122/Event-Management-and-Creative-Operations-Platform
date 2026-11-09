import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { CreativeRequestsController } from "./creative-requests.controller.js";
import { CreativeRequestsService } from "./creative-requests.service.js";
import { CreativeRequestsRepository } from "./infrastructure/creative-requests.repository.js";

/** Creative requests (EVE-232). Exports the service for the file pipeline. */
@Module({
  imports: [
    AuditModule,
    AuthModule,
    OutboxModule,
    PermissionsModule,
    TasksModule,
  ],
  controllers: [CreativeRequestsController],
  providers: [CreativeRequestsService, CreativeRequestsRepository],
  exports: [CreativeRequestsService],
})
export class CreativeRequestsModule {}
