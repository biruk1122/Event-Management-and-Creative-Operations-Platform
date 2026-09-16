import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { AUDIT_WORKSPACE_CONTEXT_RESOLVER } from "../audit/audit-workspace-context.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { TasksSchedulerRepository } from "./infrastructure/tasks-scheduler.repository.js";
import { TasksRepository } from "./infrastructure/tasks.repository.js";
import { TasksSchedulerService } from "./tasks-scheduler.service.js";
import { TasksController } from "./tasks.controller.js";
import { TasksService } from "./tasks.service.js";

@Module({
  imports: [AuditModule, AuthModule, OutboxModule, PermissionsModule],
  controllers: [TasksController],
  providers: [
    TasksRepository,
    TasksService,
    TasksSchedulerRepository,
    TasksSchedulerService,
    {
      provide: AUDIT_WORKSPACE_CONTEXT_RESOLVER,
      useExisting: TasksService,
    },
  ],
  exports: [AUDIT_WORKSPACE_CONTEXT_RESOLVER, TasksService],
})
export class TasksModule {}
