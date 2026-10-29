import { Injectable } from "@nestjs/common";

import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { isHrExecutiveOfficerManager } from "../common/security/department-access.policy.js";
import { DatabaseService } from "../database/database.service.js";
import { DocumentType, type Prisma } from "../generated/prisma/client.js";
import type { CreateDocumentDto } from "./dto/create-document.dto.js";
import type { ListDocumentsQueryDto } from "./dto/list-documents-query.dto.js";
import type { UpdateDocumentDto } from "./dto/update-document.dto.js";
import {
  documentAlreadyHasFile,
  documentAssignmentInvalid,
  documentNotFound,
} from "./documents.errors.js";
import {
  DocumentsRepository,
  type DocumentRecord,
} from "./infrastructure/documents.repository.js";
import type {
  DocumentOptionsResponse,
  DocumentResponse,
  PaginatedDocumentsResponse,
} from "./documents.contracts.js";

function toResponse(document: DocumentRecord): DocumentResponse {
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
 * Application service for Administration documents (EMP-02). The real
 * authorization boundary is {@link requireDocumentAccess}: Super Admin at
 * organization scope, or a Department Manager whose own department is HR &
 * Executive Officer (`isHrExecutiveOfficerManager`) at department scope -
 * identical to `LettersService`'s boundary. A shared recipient (handled by
 * a separate surface, not this service) never reaches this path.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly repository: DocumentsRepository,
    private readonly permissions: PermissionsService,
    private readonly db: DatabaseService,
  ) {}

  private async requireDocumentAccess(
    actingUserId: string,
    permissionKey: string,
  ): Promise<void> {
    const context = await this.permissions.getAccessContext(actingUserId);
    if (context.role === "SUPER_ADMIN") {
      if (
        await this.permissions.hasGrant(
          actingUserId,
          permissionKey,
          "ORGANIZATION",
        )
      ) {
        return;
      }
      throw permissionDenied();
    }
    if (
      isHrExecutiveOfficerManager(context) &&
      (await this.permissions.hasGrant(
        actingUserId,
        permissionKey,
        "DEPARTMENT",
      ))
    ) {
      return;
    }
    throw permissionDenied();
  }

  private async validateProject(projectId?: string | null): Promise<void> {
    if (!projectId) return;
    const project = await this.db.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      throw documentAssignmentInvalid("That project does not exist.");
    }
  }

  async list(
    actingUserId: string,
    query: ListDocumentsQueryDto,
  ): Promise<PaginatedDocumentsResponse> {
    await this.requireDocumentAccess(actingUserId, "document.read");
    const result = await this.repository.list({
      ...(query.documentType ? { documentType: query.documentType } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.uploadedById ? { uploadedById: query.uploadedById } : {}),
      ...(query.search ? { search: query.search.trim() } : {}),
      sort: query.sort,
      order: query.order,
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items: result.items.map(toResponse),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async get(actingUserId: string, id: string): Promise<DocumentResponse> {
    await this.requireDocumentAccess(actingUserId, "document.read");
    const document = await this.repository.findById(id);
    if (!document) throw documentNotFound();
    return toResponse(document);
  }

  async options(actingUserId: string): Promise<DocumentOptionsResponse> {
    await this.requireDocumentAccess(actingUserId, "document.read");
    const projects = await this.db.project.findMany({
      where: { status: { not: "CANCELLED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return {
      projects,
      types: Object.values(DocumentType),
    };
  }

  async create(
    actingUserId: string,
    dto: CreateDocumentDto,
    requestId: string,
  ): Promise<DocumentResponse> {
    await this.requireDocumentAccess(actingUserId, "document.create");
    await this.validateProject(dto.projectId);
    const created = await this.repository.create(
      {
        displayName: dto.displayName.trim(),
        documentType: dto.documentType,
        projectId: dto.projectId ?? null,
        description: dto.description?.trim() ?? null,
      },
      actingUserId,
      requestId,
    );
    return toResponse(created);
  }

  async update(
    actingUserId: string,
    id: string,
    dto: UpdateDocumentDto,
    requestId: string,
  ): Promise<DocumentResponse> {
    await this.requireDocumentAccess(actingUserId, "document.update");
    const current = await this.repository.findById(id);
    if (!current) throw documentNotFound();

    if (dto.projectId !== undefined) {
      await this.validateProject(dto.projectId);
    }
    if (
      current.sourceLetterId !== null &&
      dto.documentType !== undefined &&
      dto.documentType !== DocumentType.LETTER
    ) {
      throw documentAssignmentInvalid(
        "A document created from a letter attachment must stay type Letter.",
      );
    }

    const result = await this.repository.update(
      id,
      {
        ...(dto.displayName !== undefined
          ? { displayName: dto.displayName.trim() }
          : {}),
        ...(dto.documentType !== undefined
          ? { documentType: dto.documentType }
          : {}),
        ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() ?? null }
          : {}),
      },
      actingUserId,
      requestId,
    );
    if (result === "not_found") throw documentNotFound();
    return toResponse(result);
  }

  async remove(
    actingUserId: string,
    id: string,
    requestId: string,
  ): Promise<void> {
    // Deletion is Super Admin only: no DEPARTMENT-scope grant for
    // `document.delete` exists anywhere, so this always requires the
    // organization-scope catch-all.
    if (
      !(await this.permissions.hasGrant(
        actingUserId,
        "document.delete",
        "ORGANIZATION",
      ))
    ) {
      throw permissionDenied();
    }
    const result = await this.repository.softDelete(
      id,
      actingUserId,
      requestId,
    );
    if (result === "not_found") throw documentNotFound();
  }

  // --- Internal surface reused by FileManagementService for the
  // document's own single file (mirrors LettersService's
  // authorize/lockAttachmentFinalization/recordAttachment/
  // readAttachmentContext contract, adapted for exactly one file). ---

  /** Internal authorization boundary reused by the document-file surface. */
  async authorize(
    actingUserId: string,
    documentId: string,
    permissionKey: string,
  ): Promise<void> {
    await this.requireDocumentAccess(actingUserId, permissionKey);
    const document = await this.repository.findById(documentId);
    if (!document) throw documentNotFound();
  }

  /** Rechecks the document still exists and has no file yet. */
  async lockAttachmentFinalization(
    tx: Prisma.TransactionClient,
    input: { actingUserId: string; documentId: string },
  ): Promise<void> {
    const access = await this.repository.lockAttachmentAccess(
      tx,
      input.documentId,
    );
    if (access === "not_found") throw documentNotFound();
    if (access === "already_attached") throw documentAlreadyHasFile();
  }

  /** Direct FK set - a Document has exactly one file, not a join table. */
  async recordAttachment(
    tx: Prisma.TransactionClient,
    input: { actingUserId: string; documentId: string; fileId: string },
  ): Promise<void> {
    await this.repository.setManagedFile(tx, input.documentId, input.fileId);
  }

  async readAttachmentContext(
    actingUserId: string,
    documentId: string,
    fileId: string,
  ): Promise<Record<string, never> | null> {
    await this.authorize(actingUserId, documentId, "document.read");
    const managedFileId = await this.repository.getManagedFileId(documentId);
    return managedFileId === fileId ? {} : null;
  }
}
