import { Injectable } from "@nestjs/common";

import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { isHrExecutiveOfficerManager } from "../common/security/department-access.policy.js";
import { DatabaseService } from "../database/database.service.js";
import type { CreateLetterDto } from "./dto/create-letter.dto.js";
import type { CreateLetterRemarkDto } from "./dto/create-letter-remark.dto.js";
import type { ListLettersQueryDto } from "./dto/list-letters-query.dto.js";
import type { UpdateLetterDto } from "./dto/update-letter.dto.js";
import { letterAssignmentInvalid, letterNotFound } from "./letters.errors.js";
import {
  LettersRepository,
  type LetterRecord,
  type LetterRemarkRecord,
} from "./infrastructure/letters.repository.js";
import type {
  LetterOptionsResponse,
  LetterReferencePreviewResponse,
  LetterRemarkResponse,
  LetterResponse,
  PaginatedLettersResponse,
} from "./letters.contracts.js";
import {
  LetterCategory,
  LetterDirection,
  type Prisma,
} from "../generated/prisma/client.js";

/** Fixed company prefix - never configurable per-environment (per spec). */
const REFERENCE_PREFIX = "LELA";

/** Africa/Addis_Ababa is a fixed UTC+3 offset with no DST. */
const ADDIS_ABABA_OFFSET_MS = 3 * 60 * 60 * 1000;

function addisAbabaYear(instant: Date): number {
  return new Date(instant.getTime() + ADDIS_ABABA_OFFSET_MS).getUTCFullYear();
}

function toResponse(letter: LetterRecord): LetterResponse {
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

function toRemarkResponse(remark: LetterRemarkRecord): LetterRemarkResponse {
  return {
    id: remark.id,
    letterId: remark.letterId,
    authorId: remark.authorId,
    authorName: remark.authorName,
    body: remark.body,
    createdAt: remark.createdAt.toISOString(),
  };
}

/**
 * Application service for Administration correspondence (Letters). The real
 * authorization boundary is {@link requireLetterAccess}: Super Admin at
 * organization scope, or a Department Manager whose own department is HR &
 * Executive Officer (`isHrExecutiveOfficerManager`) at department scope -
 * the identical bespoke check Employee Management enforces. Every other
 * Department Manager holds the same generic `letter.*` grant but it never
 * resolves to anything here. Reading/adding remarks requires the same full
 * management authorization; a shared recipient (handled by a separate
 * surface, not this service) never reaches this thread.
 */
@Injectable()
export class LettersService {
  constructor(
    private readonly repository: LettersRepository,
    private readonly permissions: PermissionsService,
    private readonly db: DatabaseService,
  ) {}

  private async requireLetterAccess(
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

  private async validateDirectionFields(dto: {
    direction: LetterDirection;
    projectId?: string;
  }): Promise<void> {
    if (dto.projectId) {
      const project = await this.db.project.findUnique({
        where: { id: dto.projectId },
        select: { id: true },
      });
      if (!project) {
        throw letterAssignmentInvalid("That project does not exist.");
      }
    }
  }

  async list(
    actingUserId: string,
    query: ListLettersQueryDto,
  ): Promise<PaginatedLettersResponse> {
    await this.requireLetterAccess(actingUserId, "letter.read");
    const result = await this.repository.list({
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
      items: result.items.map(toResponse),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async get(actingUserId: string, id: string): Promise<LetterResponse> {
    await this.requireLetterAccess(actingUserId, "letter.read");
    const letter = await this.repository.findById(id);
    if (!letter) throw letterNotFound();
    return toResponse(letter);
  }

  async options(actingUserId: string): Promise<LetterOptionsResponse> {
    await this.requireLetterAccess(actingUserId, "letter.read");
    const projects = await this.db.project.findMany({
      where: { status: { not: "CANCELLED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return {
      projects,
      categories: Object.values(LetterCategory),
      directions: Object.values(LetterDirection),
    };
  }

  async referencePreview(
    actingUserId: string,
    category: LetterCategory,
  ): Promise<LetterReferencePreviewResponse> {
    await this.requireLetterAccess(actingUserId, "letter.create");
    const year = addisAbabaYear(new Date());
    const sequence = await this.repository.previewNextSequence(category, year);
    return {
      referenceNumber: `${REFERENCE_PREFIX}-${category}-${year}-${String(sequence).padStart(3, "0")}`,
    };
  }

  async create(
    actingUserId: string,
    dto: CreateLetterDto,
    requestId: string,
  ): Promise<LetterResponse> {
    await this.requireLetterAccess(actingUserId, "letter.create");
    await this.validateDirectionFields(dto);

    const year = addisAbabaYear(new Date());
    const created = await this.repository.create(
      REFERENCE_PREFIX,
      year,
      {
        direction: dto.direction,
        category: dto.category,
        date: new Date(dto.date),
        projectId: dto.projectId ?? null,
        subject: dto.subject.trim(),
        fromParty: dto.fromParty?.trim() ?? null,
        toParty: dto.toParty?.trim() ?? null,
        senderReferenceNumber: dto.senderReferenceNumber?.trim() ?? null,
        shortDescription: dto.shortDescription?.trim() ?? null,
        remark: dto.remark?.trim() ?? null,
      },
      actingUserId,
      requestId,
    );
    return toResponse(created);
  }

  async update(
    actingUserId: string,
    id: string,
    dto: UpdateLetterDto,
    requestId: string,
  ): Promise<LetterResponse> {
    await this.requireLetterAccess(actingUserId, "letter.update");
    const current = await this.repository.findById(id);
    if (!current) throw letterNotFound();

    if (dto.projectId) {
      await this.validateDirectionFields({
        direction: current.direction,
        projectId: dto.projectId,
      });
    }
    if (dto.fromParty !== undefined && current.direction !== "INCOMING") {
      throw letterAssignmentInvalid(
        "fromParty only applies to an incoming letter.",
      );
    }
    if (dto.toParty !== undefined && current.direction !== "OUTGOING") {
      throw letterAssignmentInvalid(
        "toParty only applies to an outgoing letter.",
      );
    }
    if (
      dto.senderReferenceNumber !== undefined &&
      dto.senderReferenceNumber !== null &&
      current.direction !== "INCOMING"
    ) {
      throw letterAssignmentInvalid(
        "senderReferenceNumber only applies to an incoming letter.",
      );
    }

    const result = await this.repository.update(
      id,
      actingUserId,
      {
        ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
        ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}),
        ...(dto.subject !== undefined ? { subject: dto.subject.trim() } : {}),
        ...(dto.fromParty !== undefined
          ? { fromParty: dto.fromParty.trim() }
          : {}),
        ...(dto.toParty !== undefined ? { toParty: dto.toParty.trim() } : {}),
        ...(dto.senderReferenceNumber !== undefined
          ? {
              senderReferenceNumber: dto.senderReferenceNumber?.trim() ?? null,
            }
          : {}),
        ...(dto.shortDescription !== undefined
          ? { shortDescription: dto.shortDescription?.trim() ?? null }
          : {}),
        ...(dto.remark !== undefined
          ? { remark: dto.remark?.trim() ?? null }
          : {}),
      },
      requestId,
    );
    if (result === "not_found") throw letterNotFound();
    return toResponse(result);
  }

  async remove(
    actingUserId: string,
    id: string,
    requestId: string,
  ): Promise<void> {
    // Deletion is Super Admin only: no DEPARTMENT-scope grant for
    // `letter.delete` exists anywhere, so this always requires the
    // organization-scope catch-all.
    if (
      !(await this.permissions.hasGrant(
        actingUserId,
        "letter.delete",
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
    if (result === "not_found") throw letterNotFound();
  }

  async listRemarks(
    actingUserId: string,
    letterId: string,
  ): Promise<LetterRemarkResponse[]> {
    await this.requireLetterAccess(actingUserId, "letter.read");
    const letter = await this.repository.findById(letterId);
    if (!letter) throw letterNotFound();
    const remarks = await this.repository.listRemarks(letterId);
    return remarks.map(toRemarkResponse);
  }

  async addRemark(
    actingUserId: string,
    letterId: string,
    dto: CreateLetterRemarkDto,
  ): Promise<LetterRemarkResponse> {
    await this.requireLetterAccess(actingUserId, "letter.update");
    const result = await this.repository.addRemark(
      letterId,
      actingUserId,
      dto.body.trim(),
    );
    if (result === "letter_not_found") throw letterNotFound();
    return toRemarkResponse(result);
  }

  // --- Internal surface reused by FileManagementService for letter
  // attachments (mirrors ReportsService's own authorize/lockAttachment
  // Finalization/recordAttachment/listAttachmentFileIds/
  // readAttachmentContext contract). ---

  /** Internal authorization boundary reused by the letter-file surface. */
  async authorize(
    actingUserId: string,
    letterId: string,
    permissionKey: string,
  ): Promise<void> {
    await this.requireLetterAccess(actingUserId, permissionKey);
    const letter = await this.repository.findById(letterId);
    if (!letter) throw letterNotFound();
  }

  /** Rechecks the letter still exists while the shared unit of work is open. */
  async lockAttachmentFinalization(
    tx: Prisma.TransactionClient,
    input: { actingUserId: string; letterId: string },
  ): Promise<void> {
    const access = await this.repository.lockAttachmentAccess(
      tx,
      input.letterId,
    );
    if (access === "not_found") throw letterNotFound();
  }

  /**
   * Persists the letter-owned attachment association AND, in the same
   * transaction, the linked `Document` row - the one piece of this contract
   * with no prior precedent (every other domain's attachment never also
   * creates a second entity).
   */
  async recordAttachment(
    tx: Prisma.TransactionClient,
    input: {
      actingUserId: string;
      letterId: string;
      fileId: string;
      originalFilename: string;
    },
  ): Promise<void> {
    await this.repository.createAttachment(tx, {
      letterId: input.letterId,
      fileId: input.fileId,
      attachedById: input.actingUserId,
      originalFilename: input.originalFilename,
    });
  }

  async listAttachmentFileIds(
    actingUserId: string,
    letterId: string,
    pageNumber: number,
    pageSize: number,
  ): Promise<{ fileIds: string[]; total: number }> {
    await this.authorize(actingUserId, letterId, "letter.read");
    return this.repository.listAttachmentFileIds(
      letterId,
      pageNumber,
      pageSize,
    );
  }

  async readAttachmentContext(
    actingUserId: string,
    letterId: string,
    fileId: string,
  ): Promise<Record<string, never> | null> {
    await this.authorize(actingUserId, letterId, "letter.read");
    return (await this.repository.hasAttachment(letterId, fileId)) ? {} : null;
  }
}
