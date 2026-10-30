import { Injectable } from "@nestjs/common";

import { AuditWriterService } from "../../audit/audit-writer.service.js";
import {
  AuditActorKind,
  AuditOutcome,
  OutboxActorKind,
  Prisma,
  ShareScope,
} from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";
import { OutboxWriterService } from "../../outbox/outbox-writer.service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID.test(value);
}

export interface ShareRecord {
  id: string;
  letterId: string | null;
  documentId: string | null;
  recipientId: string | null;
  recipientName: string | null;
  allEmployees: boolean;
  scope: ShareScope;
  sharedById: string | null;
  sharedByName: string | null;
  createdAt: Date;
  revokedAt: Date | null;
  revokedById: string | null;
  revokedByName: string | null;
}

export interface RecipientOption {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

const SHARE_SELECT = {
  id: true,
  letterId: true,
  documentId: true,
  recipientId: true,
  recipient: { select: { firstName: true, lastName: true, email: true } },
  allEmployees: true,
  scope: true,
  sharedById: true,
  sharedBy: { select: { firstName: true, lastName: true, email: true } },
  createdAt: true,
  revokedAt: true,
  revokedById: true,
  revokedBy: { select: { firstName: true, lastName: true, email: true } },
} as const;

type RawShare = Prisma.ShareGetPayload<{ select: typeof SHARE_SELECT }>;

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

function toRecord(raw: RawShare): ShareRecord {
  return {
    id: raw.id,
    letterId: raw.letterId,
    documentId: raw.documentId,
    recipientId: raw.recipientId,
    recipientName: personName(raw.recipient),
    allEmployees: raw.allEmployees,
    scope: raw.scope,
    sharedById: raw.sharedById,
    sharedByName: personName(raw.sharedBy),
    createdAt: raw.createdAt,
    revokedAt: raw.revokedAt,
    revokedById: raw.revokedById,
    revokedByName: personName(raw.revokedBy),
  };
}

export interface CreateShareFields {
  recipientId: string | null;
  allEmployees: boolean;
  scope: ShareScope;
}

@Injectable()
export class SharingRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditWriterService,
    private readonly outbox: OutboxWriterService,
  ) {}

  /**
   * The share insert, its audit record, and its `letter.shared`/
   * `document.shared` outbox event commit as one transaction (mirrors
   * `ReportsRepository.submit`) - a notification is never appended for a
   * share that didn't actually persist, and vice versa.
   */
  async createForLetter(
    letterId: string,
    fields: CreateShareFields,
    sharedById: string,
    requestId: string,
  ): Promise<ShareRecord | "duplicate"> {
    try {
      return await this.db.$transaction(async (tx) => {
        const created = await tx.share.create({
          data: {
            letterId,
            recipientId: fields.recipientId,
            allEmployees: fields.allEmployees,
            scope: fields.scope,
            sharedById,
          },
          select: SHARE_SELECT,
        });
        await this.audit.append(tx, {
          action: "letter.shared",
          actorKind: AuditActorKind.USER,
          actorUserId: sharedById,
          requestId,
          resourceType: "letter",
          resourceId: letterId,
          outcome: AuditOutcome.SUCCEEDED,
        });
        await this.outbox.append(tx, {
          name: "letter.shared",
          version: 1,
          actorKind: OutboxActorKind.USER,
          actorUserId: sharedById,
          correlationId: requestId,
          resourceType: "letter",
          resourceId: letterId,
          payload: { shareId: created.id },
          consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
        });
        return toRecord(created);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return "duplicate";
      }
      throw error;
    }
  }

  async createForDocument(
    documentId: string,
    fields: CreateShareFields,
    sharedById: string,
    requestId: string,
  ): Promise<ShareRecord | "duplicate"> {
    try {
      return await this.db.$transaction(async (tx) => {
        const created = await tx.share.create({
          data: {
            documentId,
            recipientId: fields.recipientId,
            allEmployees: fields.allEmployees,
            scope: fields.scope,
            sharedById,
          },
          select: SHARE_SELECT,
        });
        await this.audit.append(tx, {
          action: "document.shared",
          actorKind: AuditActorKind.USER,
          actorUserId: sharedById,
          requestId,
          resourceType: "document",
          resourceId: documentId,
          outcome: AuditOutcome.SUCCEEDED,
        });
        await this.outbox.append(tx, {
          name: "document.shared",
          version: 1,
          actorKind: OutboxActorKind.USER,
          actorUserId: sharedById,
          correlationId: requestId,
          resourceType: "document",
          resourceId: documentId,
          payload: { shareId: created.id },
          consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
        });
        return toRecord(created);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return "duplicate";
      }
      throw error;
    }
  }

  async listActiveForLetter(letterId: string): Promise<ShareRecord[]> {
    if (!isUuid(letterId)) return [];
    const rows = await this.db.share.findMany({
      where: { letterId, revokedAt: null },
      select: SHARE_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toRecord);
  }

  async listActiveForDocument(documentId: string): Promise<ShareRecord[]> {
    if (!isUuid(documentId)) return [];
    const rows = await this.db.share.findMany({
      where: { documentId, revokedAt: null },
      select: SHARE_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<ShareRecord | null> {
    if (!isUuid(id)) return null;
    const raw = await this.db.share.findUnique({
      where: { id },
      select: SHARE_SELECT,
    });
    return raw ? toRecord(raw) : null;
  }

  async revoke(
    id: string,
    revokedById: string,
    requestId: string,
  ): Promise<"revoked" | "not_found" | "already_revoked"> {
    if (!isUuid(id)) return "not_found";
    const existing = await this.db.share.findUnique({
      where: { id },
      select: { revokedAt: true, letterId: true, documentId: true },
    });
    if (!existing) return "not_found";
    if (existing.revokedAt !== null) return "already_revoked";
    await this.db.$transaction(async (tx) => {
      await tx.share.update({
        where: { id },
        data: { revokedAt: new Date(), revokedById },
      });
      await this.audit.append(tx, {
        action: "share.revoked",
        actorKind: AuditActorKind.USER,
        actorUserId: revokedById,
        requestId,
        resourceType: "share",
        resourceId: id,
        outcome: AuditOutcome.SUCCEEDED,
        metadata: {
          letterId: existing.letterId,
          documentId: existing.documentId,
        },
      });
    });
    return "revoked";
  }

  async searchRecipients(
    search: string | undefined,
    limit: number,
  ): Promise<RecipientOption[]> {
    const rows = await this.db.user.findMany({
      where: {
        status: "ACTIVE",
        ...(search
          ? {
              OR: [
                { email: { contains: search, mode: "insensitive" } },
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: { id: true, email: true, firstName: true, lastName: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }],
      take: limit,
    });
    return rows;
  }

  async findActiveUserId(userId: string): Promise<string | null> {
    if (!isUuid(userId)) return null;
    const user = await this.db.user.findFirst({
      where: { id: userId, status: "ACTIVE" },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  /** The caller's own active share for one letter, if any (direct or all-employees). */
  async findActiveForLetterAndUser(
    letterId: string,
    userId: string,
  ): Promise<ShareRecord | null> {
    if (!isUuid(letterId) || !isUuid(userId)) return null;
    const raw = await this.db.share.findFirst({
      where: {
        letterId,
        revokedAt: null,
        OR: [{ recipientId: userId }, { allEmployees: true }],
      },
      select: SHARE_SELECT,
      orderBy: [{ createdAt: "desc" }],
    });
    return raw ? toRecord(raw) : null;
  }

  /** The caller's own active share for one document, if any (direct or all-employees). */
  async findActiveForDocumentAndUser(
    documentId: string,
    userId: string,
  ): Promise<ShareRecord | null> {
    if (!isUuid(documentId) || !isUuid(userId)) return null;
    const raw = await this.db.share.findFirst({
      where: {
        documentId,
        revokedAt: null,
        OR: [{ recipientId: userId }, { allEmployees: true }],
      },
      select: SHARE_SELECT,
      orderBy: [{ createdAt: "desc" }],
    });
    return raw ? toRecord(raw) : null;
  }

  /** Letter ids actively shared with this user, directly or all-employees. */
  async listSharedLetterIds(userId: string): Promise<string[]> {
    if (!isUuid(userId)) return [];
    const rows = await this.db.share.findMany({
      where: {
        revokedAt: null,
        letterId: { not: null },
        OR: [{ recipientId: userId }, { allEmployees: true }],
      },
      select: { letterId: true },
      distinct: ["letterId"],
    });
    return rows.flatMap((row) => (row.letterId ? [row.letterId] : []));
  }

  /** Document ids actively shared with this user, directly or all-employees. */
  async listSharedDocumentIds(userId: string): Promise<string[]> {
    if (!isUuid(userId)) return [];
    const rows = await this.db.share.findMany({
      where: {
        revokedAt: null,
        documentId: { not: null },
        OR: [{ recipientId: userId }, { allEmployees: true }],
      },
      select: { documentId: true },
      distinct: ["documentId"],
    });
    return rows.flatMap((row) => (row.documentId ? [row.documentId] : []));
  }
}
