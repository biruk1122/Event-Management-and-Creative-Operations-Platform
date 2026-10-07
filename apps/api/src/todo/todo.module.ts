import { Module } from "@nestjs/common";
import { TodoDashboardQuery } from "./todo-dashboard.query.js";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { TodoController } from "./todo.controller.js";
import { TodoService } from "./todo.service.js";
import { TodoRepository } from "./infrastructure/todo.repository.js";

@Module({
  exports: [TodoDashboardQuery],
  imports: [AuthModule, PermissionsModule],
  controllers: [TodoController],
  providers: [TodoDashboardQuery, TodoService, TodoRepository],
})
export class TodoModule {}
