import { Module } from "@nestjs/common";

import { PermissionsService } from "./permissions.service.js";

/**
 * Policy evaluation, independent of any bounded module: resolves what an
 * acting user is authorized to do. `AuthModule` depends on this to populate
 * the request principal; feature modules depend on it for the precise,
 * scope-aware second authorization boundary in their application services.
 */
@Module({
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
