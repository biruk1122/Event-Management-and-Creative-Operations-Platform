import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { LettersController } from "./letters.controller.js";
import { LettersService } from "./letters.service.js";
import { LettersRepository } from "./infrastructure/letters.repository.js";

@Module({
  imports: [AuditModule, AuthModule, PermissionsModule],
  controllers: [LettersController],
  providers: [LettersService, LettersRepository],
  exports: [LettersService, LettersRepository],
})
export class LettersModule {}
