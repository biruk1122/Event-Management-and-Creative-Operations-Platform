import { Module } from "@nestjs/common";

import { AuditModule } from "../../audit/audit.module.js";
import { AuthModule } from "../../auth/auth.module.js";
import { PermissionsModule } from "../../common/security/permissions.module.js";
import { LeaveModule } from "../../leave/leave.module.js";
import { AttendanceModule } from "../attendance.module.js";
import { MobileAttendanceController } from "./mobile-attendance.controller.js";
import { MobileAttendanceService } from "./mobile-attendance.service.js";
import { MobileAttendanceRepository } from "./infrastructure/mobile-attendance.repository.js";

@Module({
  imports: [
    AttendanceModule,
    AuditModule,
    AuthModule,
    PermissionsModule,
    LeaveModule,
  ],
  controllers: [MobileAttendanceController],
  providers: [MobileAttendanceRepository, MobileAttendanceService],
})
export class MobileAttendanceModule {}
