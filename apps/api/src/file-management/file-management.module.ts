import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { ENVIRONMENT, type Environment } from "../config/environment.js";
import { DiscussModule } from "../discuss/discuss.module.js";
import { DocumentsModule } from "../documents/documents.module.js";
import { EventsModule } from "../events/events.module.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { LettersModule } from "../letters/letters.module.js";
import { ReportsModule } from "../reports/reports.module.js";
import { SharedRecordsModule } from "../shared-records/shared-records.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { DocumentFileManagementController } from "./document-file-management.controller.js";
import { ExpenseFileManagementController } from "./expense-file-management.controller.js";
import { FileManagementController } from "./file-management.controller.js";
import { FileManagementService } from "./file-management.service.js";
import { LetterFileManagementController } from "./letter-file-management.controller.js";
import { MessageFileManagementController } from "./message-file-management.controller.js";
import { ReportFileManagementController } from "./report-file-management.controller.js";
import { SharedDocumentFileManagementController } from "./shared-document-file-management.controller.js";
import { SharedLetterFileManagementController } from "./shared-letter-file-management.controller.js";
import { TaskFileManagementController } from "./task-file-management.controller.js";
import {
  DevelopmentTestFileScanner,
  FILE_SCANNER,
  UnavailableFileScanner,
} from "./file-scanner.js";
import { FileVerificationService } from "./file-verification.service.js";
import { ManagedFilesRepository } from "./infrastructure/managed-files.repository.js";
import { FILE_OBJECT_STORAGE } from "./storage/object-storage.js";
import { S3ObjectStorage } from "./storage/s3-object-storage.js";

@Module({
  imports: [
    AuditModule,
    AuthModule,
    DiscussModule,
    DocumentsModule,
    EventsModule,
    ExpensesModule,
    LettersModule,
    PermissionsModule,
    ReportsModule,
    SharedRecordsModule,
    TasksModule,
  ],
  controllers: [
    DocumentFileManagementController,
    ExpenseFileManagementController,
    FileManagementController,
    LetterFileManagementController,
    MessageFileManagementController,
    ReportFileManagementController,
    SharedDocumentFileManagementController,
    SharedLetterFileManagementController,
    TaskFileManagementController,
  ],
  providers: [
    DevelopmentTestFileScanner,
    FileManagementService,
    FileVerificationService,
    ManagedFilesRepository,
    S3ObjectStorage,
    UnavailableFileScanner,
    { provide: FILE_OBJECT_STORAGE, useExisting: S3ObjectStorage },
    {
      provide: FILE_SCANNER,
      inject: [ENVIRONMENT],
      useFactory: (environment: Environment) =>
        environment.NODE_ENV === "production" ||
        environment.FILE_SCANNER_MODE === "unavailable"
          ? new UnavailableFileScanner()
          : new DevelopmentTestFileScanner(),
    },
  ],
})
export class FileManagementModule {}
