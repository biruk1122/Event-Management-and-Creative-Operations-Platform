import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { DepartmentsController } from "./departments.controller.js";
import { DepartmentsService } from "./departments.service.js";
import { DepartmentsRepository } from "./infrastructure/departments.repository.js";

@Module({
  imports: [AuthModule, PermissionsModule],
  controllers: [DepartmentsController],
  providers: [DepartmentsService, DepartmentsRepository],
})
export class DepartmentsModule {}
