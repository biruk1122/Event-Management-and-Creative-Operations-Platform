import { Module } from "@nestjs/common";
import { TodoDashboardQuery } from "./todo-dashboard.query.js";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { TodoController } from "./todo.controller.js";
import { TodoSchedulerService } from "./todo-scheduler.service.js";
import { TodoService } from "./todo.service.js";
import { TodoRepository } from "./infrastructure/todo.repository.js";
import { TodoSchedulerRepository } from "./infrastructure/todo-scheduler.repository.js";

@Module({
  exports: [TodoDashboardQuery],
  imports: [AuthModule, OutboxModule, PermissionsModule],
  controllers: [TodoController],
  providers: [
    TodoDashboardQuery,
    TodoService,
    TodoRepository,
    TodoSchedulerRepository,
    TodoSchedulerService,
  ],
})
export class TodoModule {}
