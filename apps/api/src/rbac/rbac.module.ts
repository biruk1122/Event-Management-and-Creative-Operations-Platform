import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { RbacRepository } from "./infrastructure/rbac.repository.js";
import { PermissionsController, RolesController } from "./rbac.controller.js";
import { RbacService } from "./rbac.service.js";

@Module({
  imports: [AuthModule, PermissionsModule],
  controllers: [RolesController, PermissionsController],
  providers: [RbacService, RbacRepository],
})
export class RbacModule {}
