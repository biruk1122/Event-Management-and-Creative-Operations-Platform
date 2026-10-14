import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { ExpensesController } from "./expenses.controller.js";
import { ExpensesService } from "./expenses.service.js";
import { ExpensesRepository } from "./infrastructure/expenses.repository.js";

@Module({
  imports: [AuditModule, AuthModule, OutboxModule, PermissionsModule],
  controllers: [ExpensesController],
  providers: [ExpensesService, ExpensesRepository],
  exports: [ExpensesService, ExpensesRepository],
})
export class ExpensesModule {}
