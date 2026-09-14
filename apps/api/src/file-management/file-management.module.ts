import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { PermissionsModule } from "../common/security/permissions.module.js";
import { ENVIRONMENT, type Environment } from "../config/environment.js";
import { EventsModule } from "../events/events.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { FileManagementController } from "./file-management.controller.js";
import { FileManagementService } from "./file-management.service.js";
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
    EventsModule,
    PermissionsModule,
    TasksModule,
  ],
  controllers: [FileManagementController, TaskFileManagementController],
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
