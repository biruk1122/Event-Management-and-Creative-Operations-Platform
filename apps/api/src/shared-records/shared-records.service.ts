import { Injectable } from "@nestjs/common";

import type { ListDocumentsQueryDto } from "../documents/dto/list-documents-query.dto.js";
import {
  DocumentsRepository,
  type DocumentRecord,
} from "../documents/infrastructure/documents.repository.js";
import type { DocumentResponse } from "../documents/documents.contracts.js";
import type { ListLettersQueryDto } from "../letters/dto/list-letters-query.dto.js";
import {
  LettersRepository,
  type LetterRecord,
} from "../letters/infrastructure/letters.repository.js";
import type { LetterResponse } from "../letters/letters.contracts.js";
import { SharingRepository } from "../sharing/infrastructure/sharing.repository.js";
import { sharedRecordNotFound } from "./shared-records.errors.js";
import type {
  PaginatedSharedDocumentsResponse,
  PaginatedSharedLettersResponse,
  SharedDocumentResponse,
  SharedLetterResponse,
} from "./shared-records.contracts.js";

function toLetterResponse(letter: LetterRecord): LetterResponse {
  return {
    id: letter.id,
    referenceNumber: letter.referenceNumber,
    direction: letter.direction,
    category: letter.category,
    date: letter.date.toISOString().slice(0, 10),
    projectId: letter.projectId,
    projectName: letter.projectName,
    subject: letter.subject,
    fromParty: letter.fromParty,
    toParty: letter.toParty,
    senderReferenceNumber: letter.senderReferenceNumber,
    shortDescription: letter.shortDescription,
    remark: letter.remark,
    attachmentCount: letter.attachmentCount,
    createdById: letter.createdById,
    createdByName: letter.createdByName,
    updatedById: letter.updatedById,
    createdAt: letter.createdAt.toISOString(),
    updatedAt: letter.updatedAt.toISOString(),
  };
}

function toDocumentResponse(document: DocumentRecord): DocumentResponse {
  return {
    id: document.id,
    displayName: document.displayName,
    documentType: document.documentType,
    projectId: document.projectId,
    projectName: document.projectName,
    sourceLetterId: document.sourceLetterId,
    sourceLetterReferenceNumber: document.sourceLetterReferenceNumber,
    description: document.description,
    uploadedById: document.uploadedById,
    uploadedByName: document.uploadedByName,
    fileAvailable: document.fileAvailable,
    fileId: document.managedFileId,
    originalFilename: document.originalFilename,
    sizeBytes: document.sizeBytes,
    uploadedAt: document.uploadedAt?.toISOString() ?? null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

/**
 * The shared-with-me surface (EMP-02): reads for ANY authenticated active
 * employee of a letter/document explicitly shared with them, directly or
 * via an active all-employees grant. Wholly independent of
 * `LettersService`/`DocumentsService`'s HR-Executive-Officer-manager-or-
 * Super-Admin boundary - a caller reaches this service with no
 * `letter.*`/`document.*` grant at all, and every method here re-resolves
 * the caller's own active `Share` fresh rather than trusting a list
 * previously returned.
 */
@Injectable()
export class SharedRecordsService {
  constructor(
    private readonly sharing: SharingRepository,
    private readonly letters: LettersRepository,
    private readonly documents: DocumentsRepository,
  ) {}

  async listLetters(
    actingUserId: string,
    query: ListLettersQueryDto,
  ): Promise<PaginatedSharedLettersResponse> {
    const ids = await this.sharing.listSharedLetterIds(actingUserId);
    if (ids.length === 0) {
      return {
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        total: 0,
      };
    }
    const result = await this.letters.list({
      ids,
      ...(query.direction ? { direction: query.direction } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.search ? { search: query.search.trim() } : {}),
      sort: query.sort,
      order: query.order,
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items: result.items.map(toLetterResponse),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async getLetter(
    actingUserId: string,
    letterId: string,
  ): Promise<SharedLetterResponse> {
    const share = await this.sharing.findActiveForLetterAndUser(
      letterId,
      actingUserId,
    );
    if (!share) throw sharedRecordNotFound();
    const letter = await this.letters.findById(letterId);
    if (!letter) throw sharedRecordNotFound();
    return { ...toLetterResponse(letter), shareScope: share.scope };
  }

  async listDocuments(
    actingUserId: string,
    query: ListDocumentsQueryDto,
  ): Promise<PaginatedSharedDocumentsResponse> {
    const ids = await this.sharing.listSharedDocumentIds(actingUserId);
    if (ids.length === 0) {
      return {
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        total: 0,
      };
    }
    const result = await this.documents.list({
      ids,
      ...(query.documentType ? { documentType: query.documentType } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.search ? { search: query.search.trim() } : {}),
      sort: query.sort,
      order: query.order,
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items: result.items.map(toDocumentResponse),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async getDocument(
    actingUserId: string,
    documentId: string,
  ): Promise<SharedDocumentResponse> {
    const share = await this.sharing.findActiveForDocumentAndUser(
      documentId,
      actingUserId,
    );
    if (!share) throw sharedRecordNotFound();
    const document = await this.documents.findById(documentId);
    if (!document) throw sharedRecordNotFound();
    return { ...toDocumentResponse(document), shareScope: share.scope };
  }

  // --- Internal surface reused by FileManagementService for a shared
  // recipient's own, scope-gated file access (mirrors the
  // authorize/list/read contract LettersService/DocumentsService already
  // expose, but authorized by an active Share rather than management
  // permission). ---

  async authorizeSharedLetterRead(
    actingUserId: string,
    letterId: string,
  ): Promise<void> {
    const share = await this.sharing.findActiveForLetterAndUser(
      letterId,
      actingUserId,
    );
    if (!share) throw sharedRecordNotFound();
  }

  async authorizeSharedLetterDownload(
    actingUserId: string,
    letterId: string,
  ): Promise<void> {
    const share = await this.sharing.findActiveForLetterAndUser(
      letterId,
      actingUserId,
    );
    if (!share || share.scope !== "VIEW_AND_DOWNLOAD") {
      throw sharedRecordNotFound();
    }
  }

  async listSharedLetterAttachmentFileIds(
    actingUserId: string,
    letterId: string,
    pageNumber: number,
    pageSize: number,
  ): Promise<{ fileIds: string[]; total: number }> {
    await this.authorizeSharedLetterRead(actingUserId, letterId);
    return this.letters.listAttachmentFileIds(letterId, pageNumber, pageSize);
  }

  async readSharedLetterAttachmentContext(
    actingUserId: string,
    letterId: string,
    fileId: string,
  ): Promise<Record<string, never> | null> {
    await this.authorizeSharedLetterDownload(actingUserId, letterId);
    return (await this.letters.hasAttachment(letterId, fileId)) ? {} : null;
  }

  async readSharedDocumentFileId(
    actingUserId: string,
    documentId: string,
  ): Promise<string | null> {
    const share = await this.sharing.findActiveForDocumentAndUser(
      documentId,
      actingUserId,
    );
    if (!share || share.scope !== "VIEW_AND_DOWNLOAD") return null;
    return this.documents.getManagedFileId(documentId);
  }
}
