import { Injectable } from "@nestjs/common";

import { AuditWriterService } from "../../audit/audit-writer.service.js";
import {
  AuditActorKind,
  AuditOutcome,
  LetterCategory,
  LetterDirection,
  Prisma,
} from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";
import type { LetterSortField } from "../dto/list-letters-query.dto.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID.test(value);
}

export interface LetterRecord {
  id: string;
  referenceNumber: string;
  direction: LetterDirection;
  category: LetterCategory;
  date: Date;
  projectId: string | null;
  projectName: string | null;
  subject: string;
  fromParty: string | null;
  toParty: string | null;
  senderReferenceNumber: string | null;
  shortDescription: string | null;
  remark: string | null;
  attachmentCount: number;
  createdById: string | null;
  createdByName: string | null;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LetterRemarkRecord {
  id: string;
  letterId: string;
  authorId: string | null;
  authorName: string | null;
  body: string;
  createdAt: Date;
}

export interface CreateLetterFields {
  direction: LetterDirection;
  category: LetterCategory;
  date: Date;
  projectId?: string | null;
  subject: string;
  fromParty?: string | null;
  toParty?: string | null;
  senderReferenceNumber?: string | null;
  shortDescription?: string | null;
  remark?: string | null;
}

export interface UpdateLetterFields {
  date?: Date;
  projectId?: string | null;
  subject?: string;
  fromParty?: string;
  toParty?: string;
  senderReferenceNumber?: string | null;
  shortDescription?: string | null;
  remark?: string | null;
}

export interface ListLettersInput {
  direction?: LetterDirection;
  category?: LetterCategory;
  projectId?: string;
  search?: string;
  /** Restricts to this exact id set - used by the shared-with-me surface,
   * which lists only the letters the caller has an active share for. */
  ids?: string[];
  sort: LetterSortField;
  order: "asc" | "desc";
  page: number;
  pageSize: number;
}

const LETTER_SELECT = {
  id: true,
  referenceNumber: true,
  direction: true,
  category: true,
  date: true,
  projectId: true,
  project: { select: { name: true } },
  subject: true,
  fromParty: true,
  toParty: true,
  senderReferenceNumber: true,
  shortDescription: true,
  remark: true,
  _count: { select: { attachments: true } },
  createdById: true,
  createdBy: { select: { firstName: true, lastName: true, email: true } },
  updatedById: true,
  createdAt: true,
  updatedAt: true,
} as const;

type RawLetter = Prisma.LetterGetPayload<{ select: typeof LETTER_SELECT }>;

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

function toRecord(raw: RawLetter): LetterRecord {
  return {
    id: raw.id,
    referenceNumber: raw.referenceNumber,
    direction: raw.direction,
    category: raw.category,
    date: raw.date,
    projectId: raw.projectId,
    projectName: raw.project?.name ?? null,
    subject: raw.subject,
    fromParty: raw.fromParty,
    toParty: raw.toParty,
    senderReferenceNumber: raw.senderReferenceNumber,
    shortDescription: raw.shortDescription,
    remark: raw.remark,
    attachmentCount: raw._count.attachments,
    createdById: raw.createdById,
    createdByName: personName(raw.createdBy),
    updatedById: raw.updatedById,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function orderBy(
  sort: LetterSortField,
  order: "asc" | "desc",
): Prisma.LetterOrderByWithRelationInput[] {
  switch (sort) {
    case "referenceNumber":
      return [{ referenceNumber: order }];
    case "subject":
      return [{ subject: order }, { id: "asc" }];
    case "date":
    default:
      return [{ date: order }, { createdAt: order }];
  }
}

@Injectable()
export class LettersRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditWriterService,
  ) {}

  /** Non-reserving peek at what the next sequence would be. Never writes. */
  async previewNextSequence(
    category: LetterCategory,
    year: number,
  ): Promise<number> {
    const rows = await this.db.letterReferenceCounter.findUnique({
      where: { category_year: { category, year } },
      select: { lastSequence: true },
    });
    return (rows?.lastSequence ?? 0) + 1;
  }

  /**
   * Atomically increments (or creates) the `(category, year)` counter and
   * returns the new sequence - a single `INSERT ... ON CONFLICT DO UPDATE
   * ... RETURNING` statement, never a read-then-write in application code,
   * so concurrent creates cannot collide. Caller runs this inside the same
   * transaction as the `Letter` insert so a failed create rolls the
   * increment back too.
   */
  private async incrementSequence(
    tx: Prisma.TransactionClient,
    category: LetterCategory,
    year: number,
  ): Promise<number> {
    const rows = await tx.$queryRaw<{ last_sequence: number }[]>(
      Prisma.sql`
        INSERT INTO letter_reference_counters (category, year, last_sequence)
        VALUES (${category}::"letter_category", ${year}, 1)
        ON CONFLICT (category, year)
        DO UPDATE SET
          last_sequence = letter_reference_counters.last_sequence + 1,
          updated_at = now()
        RETURNING last_sequence
      `,
    );
    return rows[0]!.last_sequence;
  }

  /**
   * Creates a letter with a server-assigned, immutable reference number.
   * The counter increment and the letter insert share one transaction.
   */
  async create(
    referencePrefix: string,
    year: number,
    fields: CreateLetterFields,
    createdById: string,
    requestId: string,
  ): Promise<LetterRecord> {
    return this.db.$transaction(async (tx) => {
      const sequence = await this.incrementSequence(tx, fields.category, year);
      const referenceNumber = `${referencePrefix}-${fields.category}-${year}-${String(sequence).padStart(3, "0")}`;
      const created = await tx.letter.create({
        data: {
          referenceNumber,
          direction: fields.direction,
          category: fields.category,
          date: fields.date,
          projectId: fields.projectId ?? null,
          subject: fields.subject,
          fromParty: fields.fromParty ?? null,
          toParty: fields.toParty ?? null,
          senderReferenceNumber: fields.senderReferenceNumber ?? null,
          shortDescription: fields.shortDescription ?? null,
          remark: fields.remark ?? null,
          createdById,
          updatedById: createdById,
        },
        select: LETTER_SELECT,
      });
      await this.audit.append(tx, {
        action: "letter.created",
        actorKind: AuditActorKind.USER,
        actorUserId: createdById,
        requestId,
        resourceType: "letter",
        resourceId: created.id,
        outcome: AuditOutcome.SUCCEEDED,
      });
      return toRecord(created);
    });
  }

  async findById(id: string): Promise<LetterRecord | null> {
    if (!isUuid(id)) return null;
    const raw = await this.db.letter.findFirst({
      where: { id, deletedAt: null },
      select: LETTER_SELECT,
    });
    return raw ? toRecord(raw) : null;
  }

  async list(
    input: ListLettersInput,
  ): Promise<{ items: LetterRecord[]; total: number }> {
    const where: Prisma.LetterWhereInput = {
      deletedAt: null,
      ...(input.direction ? { direction: input.direction } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.ids ? { id: { in: input.ids } } : {}),
      ...(input.search
        ? {
            OR: [
              {
                referenceNumber: {
                  contains: input.search,
                  mode: "insensitive",
                },
              },
              { subject: { contains: input.search, mode: "insensitive" } },
              { fromParty: { contains: input.search, mode: "insensitive" } },
              { toParty: { contains: input.search, mode: "insensitive" } },
              {
                senderReferenceNumber: {
                  contains: input.search,
                  mode: "insensitive",
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
      this.db.letter.findMany({
        where,
        select: LETTER_SELECT,
        orderBy: orderBy(input.sort, input.order),
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.letter.count({ where }),
    ]);
    return { items: items.map(toRecord), total };
  }

  async update(
    id: string,
    updatedById: string,
    fields: UpdateLetterFields,
    requestId: string,
  ): Promise<LetterRecord | "not_found"> {
    if (!isUuid(id)) return "not_found";
    try {
      return await this.db.$transaction(async (tx) => {
        const updated = await tx.letter.update({
          where: { id, deletedAt: null },
          data: {
            ...(fields.date !== undefined ? { date: fields.date } : {}),
            ...(fields.projectId !== undefined
              ? { projectId: fields.projectId }
              : {}),
            ...(fields.subject !== undefined
              ? { subject: fields.subject }
              : {}),
            ...(fields.fromParty !== undefined
              ? { fromParty: fields.fromParty }
              : {}),
            ...(fields.toParty !== undefined
              ? { toParty: fields.toParty }
              : {}),
            ...(fields.senderReferenceNumber !== undefined
              ? { senderReferenceNumber: fields.senderReferenceNumber }
              : {}),
            ...(fields.shortDescription !== undefined
              ? { shortDescription: fields.shortDescription }
              : {}),
            ...(fields.remark !== undefined ? { remark: fields.remark } : {}),
            updatedById,
          },
          select: LETTER_SELECT,
        });
        await this.audit.append(tx, {
          action: "letter.updated",
          actorKind: AuditActorKind.USER,
          actorUserId: updatedById,
          requestId,
          resourceType: "letter",
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
    deletedById: string,
    requestId: string,
  ): Promise<"not_found" | "deleted"> {
    if (!isUuid(id)) return "not_found";
    try {
      await this.db.$transaction(async (tx) => {
        await tx.letter.update({
          where: { id, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        await this.audit.append(tx, {
          action: "letter.deleted",
          actorKind: AuditActorKind.USER,
          actorUserId: deletedById,
          requestId,
          resourceType: "letter",
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

  async listRemarks(letterId: string): Promise<LetterRemarkRecord[]> {
    if (!isUuid(letterId)) return [];
    const rows = await this.db.letterRemark.findMany({
      where: { letterId },
      select: {
        id: true,
        letterId: true,
        authorId: true,
        author: { select: { firstName: true, lastName: true, email: true } },
        body: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      letterId: row.letterId,
      authorId: row.authorId,
      authorName: personName(row.author),
      body: row.body,
      createdAt: row.createdAt,
    }));
  }

  async addRemark(
    letterId: string,
    authorId: string,
    body: string,
  ): Promise<LetterRemarkRecord | "letter_not_found"> {
    if (!isUuid(letterId)) return "letter_not_found";
    const letter = await this.db.letter.findFirst({
      where: { id: letterId, deletedAt: null },
      select: { id: true },
    });
    if (!letter) return "letter_not_found";
    const row = await this.db.letterRemark.create({
      data: { letterId, authorId, body },
      select: {
        id: true,
        letterId: true,
        authorId: true,
        author: { select: { firstName: true, lastName: true, email: true } },
        body: true,
        createdAt: true,
      },
    });
    return {
      id: row.id,
      letterId: row.letterId,
      authorId: row.authorId,
      authorName: personName(row.author),
      body: row.body,
      createdAt: row.createdAt,
    };
  }

  /**
   * `SELECT ... FOR UPDATE` + a not-deleted re-check inside the caller's
   * open finalize transaction - the same concurrency-safe pattern
   * `ReportsRepository.lockAttachmentAccess` uses, so a finalize can never
   * race a concurrent delete past the caller's earlier `authorize()` check.
   */
  async lockAttachmentAccess(
    tx: Prisma.TransactionClient,
    letterId: string,
  ): Promise<"visible" | "not_found"> {
    if (!isUuid(letterId)) return "not_found";
    const locked = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM letters WHERE id = ${letterId}::uuid AND deleted_at IS NULL FOR UPDATE`,
    );
    return locked.length === 1 ? "visible" : "not_found";
  }

  /**
   * Creates the letter-owned attachment association AND, in the same
   * transaction, the linked `Document` row pointing at the same file - the
   * physical file is never duplicated. This is the one piece of this
   * feature with no prior precedent: every other domain's `createAttachment`
   * only ever creates its own join row.
   */
  async createAttachment(
    tx: Prisma.TransactionClient,
    input: {
      letterId: string;
      fileId: string;
      attachedById: string;
      originalFilename: string;
    },
  ): Promise<void> {
    await tx.letterAttachment.create({
      data: {
        attachedById: input.attachedById,
        managedFileId: input.fileId,
        letterId: input.letterId,
      },
    });
    await tx.document.create({
      data: {
        displayName: `Letter Attachment (${input.originalFilename})`,
        documentType: "LETTER",
        managedFileId: input.fileId,
        sourceLetterId: input.letterId,
        uploadedById: input.attachedById,
      },
    });
  }

  async hasAttachment(letterId: string, fileId: string): Promise<boolean> {
    if (!isUuid(letterId) || !isUuid(fileId)) return false;
    return (
      (await this.db.letterAttachment.count({
        where: { letterId, managedFileId: fileId },
      })) === 1
    );
  }

  async listAttachmentFileIds(
    letterId: string,
    page: number,
    pageSize: number,
  ): Promise<{ fileIds: string[]; total: number }> {
    if (!isUuid(letterId)) return { fileIds: [], total: 0 };
    const where: Prisma.LetterAttachmentWhereInput = { letterId };
    const [attachments, total] = await Promise.all([
      this.db.letterAttachment.findMany({
        where,
        select: { managedFileId: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.letterAttachment.count({ where }),
    ]);
    return {
      fileIds: attachments.map(({ managedFileId }) => managedFileId),
      total,
    };
  }
}
