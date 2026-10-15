import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { ProductionsModule } from "../productions/productions.module.js";
import { ProductionLocationsController } from "./production-locations.controller.js";
import { ProductionLocationsService } from "./production-locations.service.js";
import { ProductionLocationsRepository } from "./infrastructure/production-locations.repository.js";

@Module({
  imports: [AuthModule, PermissionsModule, ProductionsModule],
  controllers: [ProductionLocationsController],
  providers: [ProductionLocationsService, ProductionLocationsRepository],
})
export class ProductionLocationsModule {}
