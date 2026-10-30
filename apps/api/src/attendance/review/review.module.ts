import { Module } from "@nestjs/common";

import { AuditModule } from "../../audit/audit.module.js";
import { AuthModule } from "../../auth/auth.module.js";
import { PermissionsModule } from "../../common/security/permissions.module.js";
import { OutboxModule } from "../../outbox/outbox.module.js";
import { LeaveModule } from "../../leave/leave.module.js";
import { AttendanceModule } from "../attendance.module.js";
import { AttendanceReviewController } from "./review.controller.js";
import { AttendanceReviewService } from "./review.service.js";
import { AttendanceReviewRepository } from "./infrastructure/review.repository.js";

@Module({
  imports: [
    AuditModule,
    AuthModule,
    PermissionsModule,
    OutboxModule,
    AttendanceModule,
    LeaveModule,
  ],
  controllers: [AttendanceReviewController],
  providers: [AttendanceReviewRepository, AttendanceReviewService],
})
export class AttendanceReviewModule {}
