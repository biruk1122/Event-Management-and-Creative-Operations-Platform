import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { LeaveController } from "./leave.controller.js";
import { LeaveExpiryService } from "./leave-expiry.service.js";
import { LeaveService } from "./leave.service.js";
import { LeaveTypesController } from "./leave-types.controller.js";
import { LeaveTypesService } from "./leave-types.service.js";
import { LeaveRepository } from "./infrastructure/leave.repository.js";
import { LeaveTypesRepository } from "./infrastructure/leave-types.repository.js";

@Module({
  imports: [AuditModule, AuthModule, PermissionsModule, OutboxModule],
  controllers: [LeaveTypesController, LeaveController],
  providers: [
    LeaveRepository,
    LeaveService,
    LeaveExpiryService,
    LeaveTypesRepository,
    LeaveTypesService,
  ],
  exports: [LeaveRepository],
})
export class LeaveModule {}
