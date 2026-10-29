import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { DocumentsModule } from "../documents/documents.module.js";
import { LettersModule } from "../letters/letters.module.js";
import { SharingModule } from "../sharing/sharing.module.js";
import { SharedRecordsController } from "./shared-records.controller.js";
import { SharedRecordsService } from "./shared-records.service.js";

@Module({
  imports: [
    AuthModule,
    DocumentsModule,
    LettersModule,
    PermissionsModule,
    SharingModule,
  ],
  controllers: [SharedRecordsController],
  providers: [SharedRecordsService],
  exports: [SharedRecordsService],
})
export class SharedRecordsModule {}
