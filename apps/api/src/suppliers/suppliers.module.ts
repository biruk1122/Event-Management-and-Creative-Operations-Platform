import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { SuppliersController } from "./suppliers.controller.js";
import { SuppliersService } from "./suppliers.service.js";
import { SuppliersRepository } from "./infrastructure/suppliers.repository.js";

@Module({
  imports: [AuthModule, PermissionsModule],
  controllers: [SuppliersController],
  providers: [SuppliersService, SuppliersRepository],
})
export class SuppliersModule {}
