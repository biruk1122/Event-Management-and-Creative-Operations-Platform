import { Module } from "@nestjs/common";

import { AuditReaderService } from "./audit-reader.service.js";
import { AuditWriterService } from "./audit-writer.service.js";
import { AuditRequestFailureService } from "./audit-request-failure.service.js";
import { AuditRepository } from "./infrastructure/audit.repository.js";

@Module({
  providers: [
    AuditReaderService,
    AuditRepository,
    AuditRequestFailureService,
    AuditWriterService,
  ],
  exports: [AuditReaderService, AuditRequestFailureService, AuditWriterService],
})
export class AuditModule {}
