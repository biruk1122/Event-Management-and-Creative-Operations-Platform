import { Module } from "@nestjs/common";
import { MeetingsDashboardQuery } from "./meetings-dashboard.query.js";

import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { SmsModule } from "../sms/sms.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { MeetingsRepository } from "./infrastructure/meetings.repository.js";
import { MeetingsSchedulerRepository } from "./infrastructure/meetings-scheduler.repository.js";
import { MeetingsController } from "./meetings.controller.js";
import { MeetingsSchedulerService } from "./meetings-scheduler.service.js";
import { MeetingsSmsService } from "./meetings-sms.service.js";
import { MeetingsService } from "./meetings.service.js";
import { JitsiConfig } from "./jitsi/jitsi.config.js";
import { JitsiService } from "./jitsi/jitsi.service.js";

@Module({
  imports: [
    AuditModule,
    AuthModule,
    OutboxModule,
    PermissionsModule,
    SmsModule,
    TasksModule,
  ],
  controllers: [MeetingsController],
  providers: [
    JitsiConfig,
    JitsiService,
    MeetingsDashboardQuery,
    MeetingsRepository,
    MeetingsService,
    MeetingsSchedulerRepository,
    MeetingsSchedulerService,
    MeetingsSmsService,
  ],
  exports: [MeetingsDashboardQuery, MeetingsService],
})
export class MeetingsModule {}
