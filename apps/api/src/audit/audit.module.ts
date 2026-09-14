import { Module } from "@nestjs/common";

import { AuditWriterService } from "./audit-writer.service.js";
import { AuditRequestFailureService } from "./audit-request-failure.service.js";
import { AuditRepository } from "./infrastructure/audit.repository.js";

@Module({
  providers: [AuditRepository, AuditRequestFailureService, AuditWriterService],
  exports: [AuditRequestFailureService, AuditWriterService],
})
export class AuditModule {}
