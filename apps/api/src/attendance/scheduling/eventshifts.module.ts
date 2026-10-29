import { Module } from "@nestjs/common";

import { AuditModule } from "../../audit/audit.module.js";
import { AuthModule } from "../../auth/auth.module.js";
import { PermissionsModule } from "../../common/security/permissions.module.js";
import { LeaveModule } from "../../leave/leave.module.js";
import { OutboxModule } from "../../outbox/outbox.module.js";
import { EventShiftsController } from "./eventshifts.controller.js";
import { EventShiftsService } from "./eventshifts.service.js";
import { EventShiftsRepository } from "./infrastructure/eventshifts.repository.js";

@Module({
  imports: [
    AuditModule,
    AuthModule,
    PermissionsModule,
    LeaveModule,
    OutboxModule,
  ],
  controllers: [EventShiftsController],
  providers: [EventShiftsRepository, EventShiftsService],
})
export class EventShiftsModule {}
