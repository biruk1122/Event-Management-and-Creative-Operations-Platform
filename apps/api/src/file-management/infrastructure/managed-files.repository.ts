import { Injectable } from "@nestjs/common";

import { ManagedFileState, Prisma } from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ManagedFileRecord {
  id: string;
  storageKey: string;
  originalFilename: string;
  declaredMediaType: string;
  declaredSizeBytes: number;
  verifiedMediaType: string | null;
  verifiedSizeBytes: number | null;
  state: ManagedFileState;
  intentExpiresAt: Date;
  intentWorkspaceId: string | null;
  intentTaskId: string | null;
  intentConversationId: string | null;
  availableAt: Date | null;
  createdAt: Date;
}

const FILE_SELECT = {
  id: true,
  storageKey: true,
  originalFilename: true,
  declaredMediaType: true,
  declaredSizeBytes: true,
  verifiedMediaType: true,
  verifiedSizeBytes: true,
  state: true,
  intentExpiresAt: true,
  intentWorkspaceId: true,
  intentTaskId: true,
  intentConversationId: true,
  availableAt: true,
  createdAt: true,
} as const;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

@Injectable()
export class ManagedFilesRepository {
  constructor(private readonly db: DatabaseService) {}

  async createPending(
    input: {
      storageKey: string;
      originalFilename: string;
      mediaType: string;
      sizeBytes: number;
      initiatedById: string;
      intentExpiresAt: Date;
    } & (
      | {
          intentWorkspaceId: string;
          intentTaskId?: never;
          intentConversationId?: never;
        }
      | {
          intentTaskId: string;
          intentWorkspaceId?: never;
          intentConversationId?: never;
        }
      | {
          intentConversationId: string;
          intentWorkspaceId?: never;
          intentTaskId?: never;
        }
    ),
  ): Promise<ManagedFileRecord> {
    return this.db.managedFile.create({
      data: {
        declaredMediaType: input.mediaType,
        declaredSizeBytes: input.sizeBytes,
        initiatedById: input.initiatedById,
        intentExpiresAt: input.intentExpiresAt,
        ...(input.intentWorkspaceId
          ? { intentWorkspaceId: input.intentWorkspaceId }
          : {}),
        ...(input.intentTaskId ? { intentTaskId: input.intentTaskId } : {}),
        ...(input.intentConversationId
          ? { intentConversationId: input.intentConversationId }
          : {}),
        originalFilename: input.originalFilename,
        storageKey: input.storageKey,
      },
      select: FILE_SELECT,
    });
  }

  async deletePending(id: string): Promise<void> {
    if (!isUuid(id)) return;
    await this.db.managedFile.deleteMany({
      where: { id, state: ManagedFileState.PENDING },
    });
  }

  async findPending(
    id: string,
    workspaceId: string,
  ): Promise<ManagedFileRecord | null> {
    if (!isUuid(id) || !isUuid(workspaceId)) return null;
    return this.db.managedFile.findFirst({
      where: {
        id,
        intentWorkspaceId: workspaceId,
        state: ManagedFileState.PENDING,
      },
      select: FILE_SELECT,
    });
  }

  async findPendingForTask(
    id: string,
    taskId: string,
  ): Promise<ManagedFileRecord | null> {
    if (!isUuid(id) || !isUuid(taskId)) return null;
    return this.db.managedFile.findFirst({
      where: {
        id,
        intentTaskId: taskId,
        state: ManagedFileState.PENDING,
      },
      select: FILE_SELECT,
    });
  }

  async findPendingForConversation(
    id: string,
    conversationId: string,
  ): Promise<ManagedFileRecord | null> {
    if (!isUuid(id) || !isUuid(conversationId)) return null;
    return this.db.managedFile.findFirst({
      where: {
        id,
        intentConversationId: conversationId,
        state: ManagedFileState.PENDING,
      },
      select: FILE_SELECT,
    });
  }

  async findAttached(
    workspaceId: string,
    fileId: string,
  ): Promise<ManagedFileRecord | null> {
    if (!isUuid(workspaceId) || !isUuid(fileId)) return null;
    const attachment = await this.db.workspaceFileAttachment.findUnique({
      where: {
        workspaceId_managedFileId: { workspaceId, managedFileId: fileId },
      },
      select: { managedFile: { select: FILE_SELECT } },
    });
    return attachment?.managedFile ?? null;
  }

  async listAttached(
    workspaceId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: ManagedFileRecord[]; total: number }> {
    if (!isUuid(workspaceId)) return { items: [], total: 0 };
    const where: Prisma.WorkspaceFileAttachmentWhereInput = {
      workspaceId,
      managedFile: { state: ManagedFileState.AVAILABLE },
    };
    const [attachments, total] = await Promise.all([
      this.db.workspaceFileAttachment.findMany({
        where,
        select: { managedFile: { select: FILE_SELECT } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.workspaceFileAttachment.count({ where }),
    ]);
    return {
      items: attachments.map((attachment) => attachment.managedFile),
      total,
    };
  }

  async findAvailableById(id: string): Promise<ManagedFileRecord | null> {
    if (!isUuid(id)) return null;
    return this.db.managedFile.findFirst({
      where: { id, state: ManagedFileState.AVAILABLE },
      select: FILE_SELECT,
    });
  }

  async findAvailableByIds(ids: string[]): Promise<ManagedFileRecord[]> {
    const validIds = ids.filter(isUuid);
    if (!validIds.length) return [];
    return this.db.managedFile.findMany({
      where: { id: { in: validIds }, state: ManagedFileState.AVAILABLE },
      select: FILE_SELECT,
    });
  }

  async makeAvailable(input: {
    fileId: string;
    workspaceId: string;
    attachedById: string;
    verifiedMediaType: string;
    verifiedSizeBytes: number;
    uploadedAt: Date;
  }): Promise<boolean> {
    if (!isUuid(input.fileId) || !isUuid(input.workspaceId)) return false;
    return this.db.$transaction(async (tx) => {
      const updated = await tx.managedFile.updateMany({
        where: {
          id: input.fileId,
          intentWorkspaceId: input.workspaceId,
          state: ManagedFileState.PENDING,
        },
        data: {
          availableAt: input.uploadedAt,
          state: ManagedFileState.AVAILABLE,
          uploadedAt: input.uploadedAt,
          verifiedMediaType: input.verifiedMediaType,
          verifiedSizeBytes: input.verifiedSizeBytes,
        },
      });
      if (updated.count !== 1) return false;
      await tx.workspaceFileAttachment.create({
        data: {
          attachedById: input.attachedById,
          managedFileId: input.fileId,
          workspaceId: input.workspaceId,
        },
      });
      return true;
    });
  }

  async makeAvailableForTask(
    tx: Prisma.TransactionClient,
    input: {
      cleanupAfter: Date;
      fileId: string;
      finalizedAt: Date;
      taskId: string;
      verifiedMediaType: string;
      verifiedSizeBytes: number;
    },
  ): Promise<"available" | "conflict" | "expired"> {
    if (!isUuid(input.fileId) || !isUuid(input.taskId)) return "conflict";
    const updated = await tx.managedFile.updateMany({
      where: {
        id: input.fileId,
        intentExpiresAt: { gt: input.finalizedAt },
        intentTaskId: input.taskId,
        state: ManagedFileState.PENDING,
      },
      data: {
        availableAt: input.finalizedAt,
        state: ManagedFileState.AVAILABLE,
        uploadedAt: input.finalizedAt,
        verifiedMediaType: input.verifiedMediaType,
        verifiedSizeBytes: input.verifiedSizeBytes,
      },
    });
    if (updated.count === 1) return "available";

    const expired = await tx.managedFile.updateMany({
      where: {
        id: input.fileId,
        intentExpiresAt: { lte: input.finalizedAt },
        intentTaskId: input.taskId,
        state: ManagedFileState.PENDING,
      },
      data: {
        cleanupAfter: input.cleanupAfter,
        state: ManagedFileState.UNAVAILABLE,
        unavailableAt: input.finalizedAt,
      },
    });
    return expired.count === 1 ? "expired" : "conflict";
  }

  async makeAvailableForConversation(
    tx: Prisma.TransactionClient,
    input: {
      cleanupAfter: Date;
      fileId: string;
      finalizedAt: Date;
      conversationId: string;
      verifiedMediaType: string;
      verifiedSizeBytes: number;
    },
  ): Promise<"available" | "conflict" | "expired"> {
    if (!isUuid(input.fileId) || !isUuid(input.conversationId)) {
      return "conflict";
    }
    const updated = await tx.managedFile.updateMany({
      where: {
        id: input.fileId,
        intentExpiresAt: { gt: input.finalizedAt },
        intentConversationId: input.conversationId,
        state: ManagedFileState.PENDING,
      },
      data: {
        availableAt: input.finalizedAt,
        state: ManagedFileState.AVAILABLE,
        uploadedAt: input.finalizedAt,
        verifiedMediaType: input.verifiedMediaType,
        verifiedSizeBytes: input.verifiedSizeBytes,
      },
    });
    if (updated.count === 1) return "available";

    const expired = await tx.managedFile.updateMany({
      where: {
        id: input.fileId,
        intentExpiresAt: { lte: input.finalizedAt },
        intentConversationId: input.conversationId,
        state: ManagedFileState.PENDING,
      },
      data: {
        cleanupAfter: input.cleanupAfter,
        state: ManagedFileState.UNAVAILABLE,
        unavailableAt: input.finalizedAt,
      },
    });
    return expired.count === 1 ? "expired" : "conflict";
  }

  async makeUnavailable(fileId: string, cleanupAfter: Date): Promise<void> {
    if (!isUuid(fileId)) return;
    await this.db.managedFile.updateMany({
      where: { id: fileId, state: ManagedFileState.PENDING },
      data: {
        cleanupAfter,
        state: ManagedFileState.UNAVAILABLE,
        unavailableAt: new Date(),
      },
    });
  }

  async detach(
    workspaceId: string,
    fileId: string,
    cleanupAfter: Date,
  ): Promise<boolean> {
    if (!isUuid(workspaceId) || !isUuid(fileId)) return false;
    return this.db.$transaction(async (tx) => {
      const updated = await tx.managedFile.updateMany({
        where: {
          id: fileId,
          state: ManagedFileState.AVAILABLE,
          workspaceAttachments: { some: { workspaceId } },
        },
        data: {
          cleanupAfter,
          state: ManagedFileState.UNAVAILABLE,
          unavailableAt: new Date(),
        },
      });
      if (updated.count !== 1) return false;
      await tx.workspaceFileAttachment.delete({
        where: {
          workspaceId_managedFileId: { workspaceId, managedFileId: fileId },
        },
      });
      return true;
    });
  }

  async findCleanupCandidates(
    now: Date,
  ): Promise<Array<{ id: string; storageKey: string }>> {
    return this.db.managedFile.findMany({
      where: {
        OR: [
          { state: ManagedFileState.PENDING, intentExpiresAt: { lte: now } },
          { state: ManagedFileState.UNAVAILABLE, cleanupAfter: { lte: now } },
        ],
      },
      orderBy: { updatedAt: "asc" },
      select: { id: true, storageKey: true },
      take: 100,
    });
  }

  async deleteCleanupCandidate(id: string, now: Date): Promise<boolean> {
    const result = await this.db.managedFile.deleteMany({
      where: {
        id,
        OR: [
          { state: ManagedFileState.PENDING, intentExpiresAt: { lte: now } },
          { state: ManagedFileState.UNAVAILABLE, cleanupAfter: { lte: now } },
        ],
      },
    });
    return result.count === 1;
  }
}
