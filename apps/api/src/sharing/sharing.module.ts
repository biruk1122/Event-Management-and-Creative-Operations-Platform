import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { DocumentsModule } from "../documents/documents.module.js";
import { LettersModule } from "../letters/letters.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { DocumentSharesController } from "./document-shares.controller.js";
import { LetterSharesController } from "./letter-shares.controller.js";
import { SharesController } from "./shares.controller.js";
import { SharingController } from "./sharing.controller.js";
import { SharingService } from "./sharing.service.js";
import { SharingRepository } from "./infrastructure/sharing.repository.js";

@Module({
  imports: [
    AuditModule,
    AuthModule,
    DocumentsModule,
    LettersModule,
    OutboxModule,
    PermissionsModule,
  ],
  controllers: [
    DocumentSharesController,
    LetterSharesController,
    SharesController,
    SharingController,
  ],
  providers: [SharingService, SharingRepository],
  exports: [SharingService, SharingRepository],
})
export class SharingModule {}
