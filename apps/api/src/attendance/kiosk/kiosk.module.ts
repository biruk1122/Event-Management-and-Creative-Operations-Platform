import { Module } from "@nestjs/common";

import { AuditModule } from "../../audit/audit.module.js";
import { AuthModule } from "../../auth/auth.module.js";
import { PermissionsModule } from "../../common/security/permissions.module.js";
import { AttendanceModule } from "../attendance.module.js";
import { KioskAdminController } from "./kiosk-admin.controller.js";
import { KioskSessionController } from "./kiosk-session.controller.js";
import { KioskSessionService } from "./kiosk-session.service.js";
import { KioskSessionTokenService } from "./kiosk-session-token.service.js";
import { KioskTokenGuard } from "./kiosk-token.guard.js";
import { KioskRepository } from "./infrastructure/kiosk.repository.js";
import { KioskService } from "./kiosk.service.js";

@Module({
  imports: [AttendanceModule, AuditModule, AuthModule, PermissionsModule],
  controllers: [KioskAdminController, KioskSessionController],
  providers: [
    KioskRepository,
    KioskService,
    KioskSessionService,
    KioskSessionTokenService,
    KioskTokenGuard,
  ],
})
export class KioskModule {}
