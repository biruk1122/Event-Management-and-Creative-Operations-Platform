import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { EmployeesController } from "./employees.controller.js";
import { EmployeesService } from "./employees.service.js";
import { EmployeesRepository } from "./infrastructure/employees.repository.js";

@Module({
  imports: [AuthModule, PermissionsModule],
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeesRepository],
})
export class EmployeesModule {}
