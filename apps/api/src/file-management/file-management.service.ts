import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { AuditWriterService } from "../audit/audit-writer.service.js";
import { DatabaseService } from "../database/database.service.js";
import { DiscussService } from "../discuss/discuss.service.js";
import type { EventRecord } from "../events/infrastructure/events.repository.js";
import { EventsRepository } from "../events/infrastructure/events.repository.js";
import {
  AuditActorKind,
  AuditOutcome,
  type PermissionScope,
} from "../generated/prisma/client.js";
import { TasksService } from "../tasks/tasks.service.js";
import type {
  DownloadGrantResponse,
  ManagedFileResponse,
  PaginatedManagedFilesResponse,
  UploadIntentResponse,
} from "./file-management.contracts.js";
import {
  fileIntentExpired,
  fileNotFound,
  fileScannerUnavailable,
  fileStateConflict,
  fileUploadNotFound,
  fileVerificationFailed,
  invalidFileDeclaration,
} from "./file-management.errors.js";
import { FILE_SCANNER, type FileScanner } from "./file-scanner.js";
import { FileVerificationService } from "./file-verification.service.js";
import {
  ManagedFilesRepository,
  type ManagedFileRecord,
} from "./infrastructure/managed-files.repository.js";
import {
  FILE_OBJECT_STORAGE,
  type ObjectStorage,
} from "./storage/object-storage.js";
import type { CreateUploadIntentDto } from "./dto/create-upload-intent.dto.js";
import type { ListManagedFilesQueryDto } from "./dto/list-managed-files-query.dto.js";

const INTENT_TTL_MS = 24 * 60 * 60 * 1000;
const REJECTED_OBJECT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DETACHED_FILE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function toResponse(record: ManagedFileRecord): ManagedFileResponse {
  return {
    createdAt: record.createdAt.toISOString(),
    filename: record.originalFilename,
    id: record.id,
    mediaType: record.verifiedMediaType ?? record.declaredMediaType,
    sizeBytes: record.verifiedSizeBytes ?? record.declaredSizeBytes,
    state: record.state === "AVAILABLE" ? "available" : "pending",
    ...(record.availableAt
      ? { availableAt: record.availableAt.toISOString() }
      : {}),
  };
}

function validateFilename(value: string): string {
  const filename = value.normalize("NFC").trim();
  if (
    !filename ||
    Buffer.byteLength(filename, "utf8") > 255 ||
    [...filename].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return (
        character === "\\" || character === "/" || code < 32 || code === 127
      );
    }) ||
    filename === "." ||
    filename === ".."
  ) {
    throw invalidFileDeclaration(
      "The filename must be a non-empty safe display name of at most 255 UTF-8 bytes.",
    );
  }
  return filename;
}

/**
 * Owns the secure managed-file lifecycle for explicit parent surfaces. It
 * deliberately does not accept an entity type/id pair or expose storage keys.
 */
@Injectable()
export class FileManagementService {
  constructor(
    private readonly audit: AuditWriterService,
    private readonly db: DatabaseService,
    private readonly discuss: DiscussService,
    private readonly events: EventsRepository,
    private readonly files: ManagedFilesRepository,
    private readonly permissions: PermissionsService,
    private readonly tasks: TasksService,
    private readonly verification: FileVerificationService,
    @Inject(FILE_OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(FILE_SCANNER) private readonly scanner: FileScanner,
  ) {}

  private async requireGrant(
    actingUserId: string,
    permissionKey: string,
    scope: PermissionScope = "ORGANIZATION",
  ): Promise<void> {
    if (
      !(await this.permissions.hasGrant(actingUserId, permissionKey, scope))
    ) {
      throw permissionDenied();
    }
  }

  private async eventOrThrow(eventId: string): Promise<EventRecord> {
    const event = await this.events.findById(eventId);
    if (!event) {
      // File endpoints use the owning module's not-found behavior before an
      // attachment is resolved, so they never reveal a workspace identifier.
      throw fileNotFound();
    }
    return event;
  }

  async createUploadIntent(
    actingUserId: string,
    eventId: string,
    dto: CreateUploadIntentDto,
  ): Promise<UploadIntentResponse> {
    const event = await this.eventOrThrow(eventId);
    await this.requireGrant(actingUserId, "event.update");
    const filename = validateFilename(dto.filename);
    const intentExpiresAt = new Date(Date.now() + INTENT_TTL_MS);
    const file = await this.files.createPending({
      initiatedById: actingUserId,
      intentExpiresAt,
      intentWorkspaceId: event.workspaceId,
      mediaType: dto.mediaType,
      originalFilename: filename,
      sizeBytes: dto.sizeBytes,
      storageKey: `files/${randomUUID()}`,
    });

    try {
      const upload = await this.storage.createUploadGrant({
        key: file.storageKey,
        mediaType: file.declaredMediaType,
        sizeBytes: file.declaredSizeBytes,
      });
      return {
        ...toResponse(file),
        intentExpiresAt: file.intentExpiresAt.toISOString(),
        upload,
      };
    } catch (error) {
      // A grant was not issued, so deleting this intent cannot delete a client
      // object. If cleanup races it, deleteMany remains harmless.
      await this.files.deletePending(file.id);
      throw error;
    }
  }

  async finalize(
    actingUserId: string,
    eventId: string,
    fileId: string,
  ): Promise<ManagedFileResponse> {
    const event = await this.eventOrThrow(eventId);
    await this.requireGrant(actingUserId, "event.update");
    const file = await this.files.findPending(fileId, event.workspaceId);
    if (!file) throw fileNotFound();

    const now = new Date();
    if (file.intentExpiresAt <= now) {
      await this.files.makeUnavailable(
        file.id,
        new Date(now.getTime() + REJECTED_OBJECT_RETENTION_MS),
      );
      throw fileIntentExpired();
    }

    const object = await this.storage.readObject(file.storageKey);
    if (!object) throw fileUploadNotFound();
    const verified = await this.verification.verify(
      file.declaredMediaType,
      object.bytes,
    );
    if (!verified || object.sizeBytes !== file.declaredSizeBytes) {
      await this.files.makeUnavailable(
        file.id,
        new Date(now.getTime() + REJECTED_OBJECT_RETENTION_MS),
      );
      throw fileVerificationFailed();
    }

    const scan = await this.scanner.scan({
      bytes: object.bytes,
      mediaType: verified.mediaType,
    });
    if (scan === "infected") {
      await this.files.makeUnavailable(
        file.id,
        new Date(now.getTime() + REJECTED_OBJECT_RETENTION_MS),
      );
      throw fileVerificationFailed();
    }
    if (scan === "unavailable") {
      await this.files.makeUnavailable(
        file.id,
        new Date(now.getTime() + REJECTED_OBJECT_RETENTION_MS),
      );
      throw fileScannerUnavailable();
    }

    const finalized = await this.files.makeAvailable({
      attachedById: actingUserId,
      fileId: file.id,
      uploadedAt: now,
      verifiedMediaType: verified.mediaType,
      verifiedSizeBytes: verified.sizeBytes,
      workspaceId: event.workspaceId,
    });
    if (!finalized) throw fileStateConflict();
    const available = await this.files.findAttached(event.workspaceId, file.id);
    if (!available) throw fileStateConflict();
    return toResponse(available);
  }

  async list(
    actingUserId: string,
    eventId: string,
    query: ListManagedFilesQueryDto,
  ): Promise<PaginatedManagedFilesResponse> {
    const event = await this.eventOrThrow(eventId);
    await this.requireGrant(actingUserId, "event.read");
    const { items, total } = await this.files.listAttached(
      event.workspaceId,
      query.page,
      query.pageSize,
    );
    return {
      items: items.map(toResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async download(
    actingUserId: string,
    eventId: string,
    fileId: string,
  ): Promise<DownloadGrantResponse> {
    const event = await this.eventOrThrow(eventId);
    await this.requireGrant(actingUserId, "event.read");
    const file = await this.files.findAttached(event.workspaceId, fileId);
    if (!file || file.state !== "AVAILABLE" || !file.verifiedMediaType)
      throw fileNotFound();
    const grant = await this.storage.createDownloadGrant({
      filename: file.originalFilename,
      key: file.storageKey,
      mediaType: file.verifiedMediaType,
    });
    return {
      expiresAt: grant.expiresAt.toISOString(),
      filename: file.originalFilename,
      mediaType: file.verifiedMediaType,
      url: grant.url,
    };
  }

  async remove(
    actingUserId: string,
    eventId: string,
    fileId: string,
  ): Promise<void> {
    const event = await this.eventOrThrow(eventId);
    await this.requireGrant(actingUserId, "event.update");
    const detached = await this.files.detach(
      event.workspaceId,
      fileId,
      new Date(Date.now() + DETACHED_FILE_RETENTION_MS),
    );
    if (!detached) throw fileNotFound();
  }

  async createTaskUploadIntent(
    actingUserId: string,
    taskId: string,
    dto: CreateUploadIntentDto,
  ): Promise<UploadIntentResponse> {
    await this.tasks.authorize(actingUserId, taskId, "task.attachment.create");
    const filename = validateFilename(dto.filename);
    const intentExpiresAt = new Date(Date.now() + INTENT_TTL_MS);
    const file = await this.files.createPending({
      initiatedById: actingUserId,
      intentExpiresAt,
      intentTaskId: taskId,
      mediaType: dto.mediaType,
      originalFilename: filename,
      sizeBytes: dto.sizeBytes,
      storageKey: `files/${randomUUID()}`,
    });
    try {
      const upload = await this.storage.createUploadGrant({
        key: file.storageKey,
        mediaType: file.declaredMediaType,
        sizeBytes: file.declaredSizeBytes,
      });
      return {
        ...toResponse(file),
        intentExpiresAt: file.intentExpiresAt.toISOString(),
        upload,
      };
    } catch (error) {
      await this.files.deletePending(file.id);
      throw error;
    }
  }

  async finalizeTaskUpload(
    actingUserId: string,
    taskId: string,
    fileId: string,
  ): Promise<ManagedFileResponse> {
    await this.tasks.authorize(actingUserId, taskId, "task.attachment.create");
    const file = await this.files.findPendingForTask(fileId, taskId);
    if (!file) throw fileNotFound();
    const now = new Date();
    if (file.intentExpiresAt <= now) {
      await this.files.makeUnavailable(
        file.id,
        new Date(now.getTime() + REJECTED_OBJECT_RETENTION_MS),
      );
      throw fileIntentExpired();
    }
    const object = await this.storage.readObject(file.storageKey);
    if (!object) throw fileUploadNotFound();
    const verified = await this.verification.verify(
      file.declaredMediaType,
      object.bytes,
    );
    if (!verified || object.sizeBytes !== file.declaredSizeBytes) {
      await this.files.makeUnavailable(
        file.id,
        new Date(now.getTime() + REJECTED_OBJECT_RETENTION_MS),
      );
      throw fileVerificationFailed();
    }
    const scan = await this.scanner.scan({
      bytes: object.bytes,
      mediaType: verified.mediaType,
    });
    if (scan === "infected") {
      await this.files.makeUnavailable(
        file.id,
        new Date(now.getTime() + REJECTED_OBJECT_RETENTION_MS),
      );
      throw fileVerificationFailed();
    }
    if (scan === "unavailable") {
      await this.files.makeUnavailable(
        file.id,
        new Date(now.getTime() + REJECTED_OBJECT_RETENTION_MS),
      );
      throw fileScannerUnavailable();
    }
    const finalized = await this.db.$transaction(async (tx) => {
      await this.tasks.lockAttachmentFinalization(tx, {
        actingUserId,
        taskId,
      });
      const finalizedAt = new Date();
      const available = await this.files.makeAvailableForTask(tx, {
        cleanupAfter: new Date(
          finalizedAt.getTime() + REJECTED_OBJECT_RETENTION_MS,
        ),
        fileId: file.id,
        finalizedAt,
        taskId,
        verifiedMediaType: verified.mediaType,
        verifiedSizeBytes: verified.sizeBytes,
      });
      if (available !== "available") return available;
      await this.tasks.recordAttachment(tx, {
        actingUserId,
        fileId: file.id,
        taskId,
      });
      return "available" as const;
    });
    if (finalized === "expired") throw fileIntentExpired();
    if (finalized === "conflict") throw fileStateConflict();
    const available = await this.files.findAvailableById(file.id);
    if (!available) throw fileStateConflict();
    return toResponse(available);
  }

  async listTaskFiles(
    actingUserId: string,
    taskId: string,
    query: ListManagedFilesQueryDto,
  ): Promise<PaginatedManagedFilesResponse> {
    const { fileIds, total } = await this.tasks.listAttachmentFileIds(
      actingUserId,
      taskId,
      query.page,
      query.pageSize,
    );
    const byId = new Map(
      (await this.files.findAvailableByIds(fileIds)).map((file) => [
        file.id,
        file,
      ]),
    );
    const items = fileIds.flatMap((id) => {
      const file = byId.get(id);
      return file ? [file] : [];
    });
    return {
      items: items.map(toResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async downloadTaskFile(
    actingUserId: string,
    taskId: string,
    fileId: string,
    requestId: string,
  ): Promise<DownloadGrantResponse> {
    const parent = await this.tasks.readAttachmentContext(
      actingUserId,
      taskId,
      fileId,
    );
    if (!parent) throw fileNotFound();
    const file = await this.files.findAvailableById(fileId);
    if (!file || file.state !== "AVAILABLE" || !file.verifiedMediaType)
      throw fileNotFound();
    const grant = await this.storage.createDownloadGrant({
      filename: file.originalFilename,
      key: file.storageKey,
      mediaType: file.verifiedMediaType,
    });
    await this.audit.record({
      action: "managed_file.downloaded",
      actorKind: AuditActorKind.USER,
      actorUserId: actingUserId,
      metadata: { parentId: taskId, parentType: "task" },
      outcome: AuditOutcome.SUCCEEDED,
      requestId,
      resourceId: file.id,
      resourceType: "managed_file",
      ...(parent.workspaceId ? { workspaceContext: parent.workspaceId } : {}),
    });
    return {
      expiresAt: grant.expiresAt.toISOString(),
      filename: file.originalFilename,
      mediaType: file.verifiedMediaType,
      url: grant.url,
    };
  }

  /** The upload intent is scoped to the conversation, not a specific message:
   * a client typically attaches a file while still composing, before the
   * message that will carry it exists. */
  async createConversationUploadIntent(
    actingUserId: string,
    conversationId: string,
    dto: CreateUploadIntentDto,
  ): Promise<UploadIntentResponse> {
    await this.discuss.authorize(actingUserId, conversationId, "message.send");
    const filename = validateFilename(dto.filename);
    const intentExpiresAt = new Date(Date.now() + INTENT_TTL_MS);
    const file = await this.files.createPending({
      initiatedById: actingUserId,
      intentExpiresAt,
      intentConversationId: conversationId,
      mediaType: dto.mediaType,
      originalFilename: filename,
      sizeBytes: dto.sizeBytes,
      storageKey: `files/${randomUUID()}`,
    });
    try {
      const upload = await this.storage.createUploadGrant({
        key: file.storageKey,
        mediaType: file.declaredMediaType,
        sizeBytes: file.declaredSizeBytes,
      });
      return {
        ...toResponse(file),
        intentExpiresAt: file.intentExpiresAt.toISOString(),
        upload,
      };
    } catch (error) {
      await this.files.deletePending(file.id);
      throw error;
    }
  }

  /** Verifies, scans, and attaches a pending upload to an already-created
   * message. */
  async finalizeMessageUpload(
    actingUserId: string,
    conversationId: string,
    messageId: string,
    fileId: string,
  ): Promise<ManagedFileResponse> {
    await this.discuss.authorize(actingUserId, conversationId, "message.send");
    const file = await this.files.findPendingForConversation(
      fileId,
      conversationId,
    );
    if (!file) throw fileNotFound();
    const now = new Date();
    if (file.intentExpiresAt <= now) {
      await this.files.makeUnavailable(
        file.id,
        new Date(now.getTime() + REJECTED_OBJECT_RETENTION_MS),
      );
      throw fileIntentExpired();
    }
    const object = await this.storage.readObject(file.storageKey);
    if (!object) throw fileUploadNotFound();
    const verified = await this.verification.verify(
      file.declaredMediaType,
      object.bytes,
    );
    if (!verified || object.sizeBytes !== file.declaredSizeBytes) {
      await this.files.makeUnavailable(
        file.id,
        new Date(now.getTime() + REJECTED_OBJECT_RETENTION_MS),
      );
      throw fileVerificationFailed();
    }
    const scan = await this.scanner.scan({
      bytes: object.bytes,
      mediaType: verified.mediaType,
    });
    if (scan === "infected") {
      await this.files.makeUnavailable(
        file.id,
        new Date(now.getTime() + REJECTED_OBJECT_RETENTION_MS),
      );
      throw fileVerificationFailed();
    }
    if (scan === "unavailable") {
      await this.files.makeUnavailable(
        file.id,
        new Date(now.getTime() + REJECTED_OBJECT_RETENTION_MS),
      );
      throw fileScannerUnavailable();
    }
    const finalized = await this.db.$transaction(async (tx) => {
      await this.discuss.lockAttachmentFinalization(tx, {
        actingUserId,
        conversationId,
        messageId,
      });
      const finalizedAt = new Date();
      const available = await this.files.makeAvailableForConversation(tx, {
        cleanupAfter: new Date(
          finalizedAt.getTime() + REJECTED_OBJECT_RETENTION_MS,
        ),
        fileId: file.id,
        finalizedAt,
        conversationId,
        verifiedMediaType: verified.mediaType,
        verifiedSizeBytes: verified.sizeBytes,
      });
      if (available !== "available") return available;
      await this.discuss.recordAttachment(tx, {
        actingUserId,
        fileId: file.id,
        messageId,
      });
      return "available" as const;
    });
    if (finalized === "expired") throw fileIntentExpired();
    if (finalized === "conflict") throw fileStateConflict();
    const available = await this.files.findAvailableById(file.id);
    if (!available) throw fileStateConflict();
    return toResponse(available);
  }

  async listMessageFiles(
    actingUserId: string,
    conversationId: string,
    messageId: string,
    query: ListManagedFilesQueryDto,
  ): Promise<PaginatedManagedFilesResponse> {
    const { fileIds, total } = await this.discuss.listAttachmentFileIds(
      actingUserId,
      conversationId,
      messageId,
      query.page,
      query.pageSize,
    );
    const byId = new Map(
      (await this.files.findAvailableByIds(fileIds)).map((file) => [
        file.id,
        file,
      ]),
    );
    const items = fileIds.flatMap((id) => {
      const file = byId.get(id);
      return file ? [file] : [];
    });
    return {
      items: items.map(toResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async downloadMessageFile(
    actingUserId: string,
    conversationId: string,
    messageId: string,
    fileId: string,
    requestId: string,
  ): Promise<DownloadGrantResponse> {
    const parent = await this.discuss.readAttachmentContext(
      actingUserId,
      conversationId,
      messageId,
      fileId,
    );
    if (!parent) throw fileNotFound();
    const file = await this.files.findAvailableById(fileId);
    if (!file || file.state !== "AVAILABLE" || !file.verifiedMediaType)
      throw fileNotFound();
    const grant = await this.storage.createDownloadGrant({
      filename: file.originalFilename,
      key: file.storageKey,
      mediaType: file.verifiedMediaType,
    });
    await this.audit.record({
      action: "managed_file.downloaded",
      actorKind: AuditActorKind.USER,
      actorUserId: actingUserId,
      metadata: { parentId: messageId, parentType: "message" },
      outcome: AuditOutcome.SUCCEEDED,
      requestId,
      resourceId: file.id,
      resourceType: "managed_file",
      ...(parent.workspaceId ? { workspaceContext: parent.workspaceId } : {}),
    });
    return {
      expiresAt: grant.expiresAt.toISOString(),
      filename: file.originalFilename,
      mediaType: file.verifiedMediaType,
      url: grant.url,
    };
  }

  /** Idempotent batch for the scheduled worker that a deployment wires later. */
  async cleanup(now = new Date()): Promise<number> {
    const candidates = await this.files.findCleanupCandidates(now);
    let removed = 0;
    for (const candidate of candidates) {
      await this.storage.deleteObject(candidate.storageKey);
      if (await this.files.deleteCleanupCandidate(candidate.id, now))
        removed += 1;
    }
    return removed;
  }
}
