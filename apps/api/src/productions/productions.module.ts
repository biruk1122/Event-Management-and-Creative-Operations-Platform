import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { ProductionsController } from "./productions.controller.js";
import { ProductionsService } from "./productions.service.js";
import { ProductionsRepository } from "./infrastructure/productions.repository.js";
@Module({
  imports: [AuthModule, PermissionsModule, WorkspacesModule],
  controllers: [ProductionsController],
  providers: [ProductionsService, ProductionsRepository],
  exports: [ProductionsService],
})
export class ProductionsModule {}
