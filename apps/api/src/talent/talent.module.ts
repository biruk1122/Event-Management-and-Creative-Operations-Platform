import { Module } from "@nestjs/common";
import { TalentDashboardQuery } from "./talent-dashboard.query.js";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { TalentAccessService } from "./talent-access.service.js";
import {
  TalentAssignableWorksController,
  TalentAssignmentsController,
} from "./talent-assignments.controller.js";
import { TalentAssignmentsService } from "./talent-assignments.service.js";
import { TalentController } from "./talent.controller.js";
import { TalentService } from "./talent.service.js";
import { TalentAssignmentsRepository } from "./infrastructure/talent-assignments.repository.js";
import { TalentRepository } from "./infrastructure/talent.repository.js";

@Module({
  imports: [AuditModule, AuthModule, OutboxModule, PermissionsModule],
  controllers: [
    TalentController,
    TalentAssignmentsController,
    TalentAssignableWorksController,
  ],
  providers: [
    TalentDashboardQuery,
    TalentService,
    TalentRepository,
    TalentAccessService,
    TalentAssignmentsService,
    TalentAssignmentsRepository,
  ],
  exports: [
    TalentAccessService,
    TalentDashboardQuery,
    TalentService,
    TalentAssignmentsService,
  ],
})
export class TalentModule {}
