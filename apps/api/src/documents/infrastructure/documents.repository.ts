import { Injectable } from "@nestjs/common";

import { AuditWriterService } from "../../audit/audit-writer.service.js";
import {
  AuditActorKind,
  AuditOutcome,
  DocumentType,
  Prisma,
} from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";
import type { DocumentSortField } from "../dto/list-documents-query.dto.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID.test(value);
}

export interface DocumentRecord {
  id: string;
  displayName: string;
  documentType: DocumentType;
  projectId: string | null;
  projectName: string | null;
  sourceLetterId: string | null;
  sourceLetterReferenceNumber: string | null;
  description: string | null;
  uploadedById: string | null;
  uploadedByName: string | null;
  managedFileId: string | null;
  fileAvailable: boolean;
  originalFilename: string | null;
  sizeBytes: number | null;
  uploadedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDocumentFields {
  displayName: string;
  documentType: DocumentType;
  projectId?: string | null;
  description?: string | null;
}

export interface UpdateDocumentFields {
  displayName?: string;
  documentType?: DocumentType;
  projectId?: string | null;
  description?: string | null;
}

export interface ListDocumentsInput {
  documentType?: DocumentType;
  projectId?: string;
  uploadedById?: string;
  search?: string;
  /** Restricts to this exact id set - used by the shared-with-me surface,
   * which lists only the documents the caller has an active share for. */
  ids?: string[];
  sort: DocumentSortField;
  order: "asc" | "desc";
  page: number;
  pageSize: number;
}

const DOCUMENT_SELECT = {
  id: true,
  displayName: true,
  documentType: true,
  projectId: true,
  project: { select: { name: true } },
  sourceLetterId: true,
  sourceLetter: { select: { referenceNumber: true } },
  description: true,
  uploadedById: true,
  uploadedBy: { select: { firstName: true, lastName: true, email: true } },
  managedFileId: true,
  managedFile: {
    select: {
      originalFilename: true,
      verifiedSizeBytes: true,
      declaredSizeBytes: true,
      availableAt: true,
      state: true,
    },
  },
  createdAt: true,
  updatedAt: true,
} as const;

type RawDocument = Prisma.DocumentGetPayload<{
  select: typeof DOCUMENT_SELECT;
}>;

function personName(
  person: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null,
): string | null {
  if (!person) return null;
  const name = [person.firstName, person.lastName]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  return name.length > 0 ? name : person.email;
}

function toRecord(raw: RawDocument): DocumentRecord {
  return {
    id: raw.id,
    displayName: raw.displayName,
    documentType: raw.documentType,
    projectId: raw.projectId,
    projectName: raw.project?.name ?? null,
    sourceLetterId: raw.sourceLetterId,
    sourceLetterReferenceNumber: raw.sourceLetter?.referenceNumber ?? null,
    description: raw.description,
    uploadedById: raw.uploadedById,
    uploadedByName: personName(raw.uploadedBy),
    managedFileId: raw.managedFileId,
    fileAvailable: raw.managedFile?.state === "AVAILABLE",
    originalFilename: raw.managedFile?.originalFilename ?? null,
    sizeBytes:
      raw.managedFile?.verifiedSizeBytes ??
      raw.managedFile?.declaredSizeBytes ??
      null,
    uploadedAt: raw.managedFile?.availableAt ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function orderBy(
  sort: DocumentSortField,
  order: "asc" | "desc",
): Prisma.DocumentOrderByWithRelationInput[] {
  switch (sort) {
    case "displayName":
      return [{ displayName: order }, { id: "asc" }];
    case "createdAt":
      return [{ createdAt: order }, { id: "asc" }];
    case "uploadedAt":
    default:
      return [{ managedFile: { availableAt: order } }, { createdAt: order }];
  }
}

@Injectable()
export class DocumentsRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditWriterService,
  ) {}

  async create(
    fields: CreateDocumentFields,
    uploadedById: string,
    requestId: string,
  ): Promise<DocumentRecord> {
    return this.db.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          displayName: fields.displayName,
          documentType: fields.documentType,
          projectId: fields.projectId ?? null,
          description: fields.description ?? null,
          uploadedById,
        },
        select: DOCUMENT_SELECT,
      });
      await this.audit.append(tx, {
        action: "document.created",
        actorKind: AuditActorKind.USER,
        actorUserId: uploadedById,
        requestId,
        resourceType: "document",
        resourceId: created.id,
        outcome: AuditOutcome.SUCCEEDED,
      });
      return toRecord(created);
    });
  }

  async findById(id: string): Promise<DocumentRecord | null> {
    if (!isUuid(id)) return null;
    const raw = await this.db.document.findFirst({
      where: { id, deletedAt: null },
      select: DOCUMENT_SELECT,
    });
    return raw ? toRecord(raw) : null;
  }

  async list(
    input: ListDocumentsInput,
  ): Promise<{ items: DocumentRecord[]; total: number }> {
    const where: Prisma.DocumentWhereInput = {
      deletedAt: null,
      ...(input.documentType ? { documentType: input.documentType } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.uploadedById ? { uploadedById: input.uploadedById } : {}),
      ...(input.ids ? { id: { in: input.ids } } : {}),
      ...(input.search
        ? {
            OR: [
              {
                displayName: { contains: input.search, mode: "insensitive" },
              },
              {
                managedFile: {
                  originalFilename: {
                    contains: input.search,
                    mode: "insensitive",
                  },
                },
              },
              {
                project: {
                  name: { contains: input.search, mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.db.$transaction([
      this.db.document.findMany({
        where,
        select: DOCUMENT_SELECT,
        orderBy: orderBy(input.sort, input.order),
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.document.count({ where }),
    ]);
    return { items: items.map(toRecord), total };
  }

  async update(
    id: string,
    fields: UpdateDocumentFields,
    actorUserId: string,
    requestId: string,
  ): Promise<DocumentRecord | "not_found"> {
    if (!isUuid(id)) return "not_found";
    try {
      return await this.db.$transaction(async (tx) => {
        const updated = await tx.document.update({
          where: { id, deletedAt: null },
          data: {
            ...(fields.displayName !== undefined
              ? { displayName: fields.displayName }
              : {}),
            ...(fields.documentType !== undefined
              ? { documentType: fields.documentType }
              : {}),
            ...(fields.projectId !== undefined
              ? { projectId: fields.projectId }
              : {}),
            ...(fields.description !== undefined
              ? { description: fields.description }
              : {}),
          },
          select: DOCUMENT_SELECT,
        });
        await this.audit.append(tx, {
          action: "document.updated",
          actorKind: AuditActorKind.USER,
          actorUserId,
          requestId,
          resourceType: "document",
          resourceId: id,
          outcome: AuditOutcome.SUCCEEDED,
        });
        return toRecord(updated);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        return "not_found";
      }
      throw error;
    }
  }

  /** Soft delete. Excluded from every ordinary query the moment this is set. */
  async softDelete(
    id: string,
    actorUserId: string,
    requestId: string,
  ): Promise<"not_found" | "deleted"> {
    if (!isUuid(id)) return "not_found";
    try {
      await this.db.$transaction(async (tx) => {
        await tx.document.update({
          where: { id, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        await this.audit.append(tx, {
          action: "document.deleted",
          actorKind: AuditActorKind.USER,
          actorUserId,
          requestId,
          resourceType: "document",
          resourceId: id,
          outcome: AuditOutcome.SUCCEEDED,
        });
      });
      return "deleted";
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        return "not_found";
      }
      throw error;
    }
  }

  /**
   * `SELECT ... FOR UPDATE` + a not-deleted, no-file-yet re-check inside the
   * caller's open finalize transaction - mirrors
   * `LettersRepository.lockAttachmentAccess`, but a Document can only ever
   * take one file, so an already-attached document is a conflict here
   * rather than something to list alongside others.
   */
  async lockAttachmentAccess(
    tx: Prisma.TransactionClient,
    documentId: string,
  ): Promise<"available_for_attachment" | "already_attached" | "not_found"> {
    if (!isUuid(documentId)) return "not_found";
    const locked = await tx.$queryRaw<
      { id: string; managed_file_id: string | null }[]
    >(
      Prisma.sql`SELECT id, managed_file_id FROM documents WHERE id = ${documentId}::uuid AND deleted_at IS NULL FOR UPDATE`,
    );
    if (locked.length !== 1) return "not_found";
    return locked[0]!.managed_file_id === null
      ? "available_for_attachment"
      : "already_attached";
  }

  /** Direct FK set - a Document has exactly one file, not a join table. */
  async setManagedFile(
    tx: Prisma.TransactionClient,
    documentId: string,
    fileId: string,
  ): Promise<void> {
    await tx.document.update({
      where: { id: documentId },
      data: { managedFileId: fileId },
    });
  }

  async getManagedFileId(documentId: string): Promise<string | null> {
    if (!isUuid(documentId)) return null;
    const row = await this.db.document.findFirst({
      where: { id: documentId, deletedAt: null },
      select: { managedFileId: true },
    });
    return row?.managedFileId ?? null;
  }
}
