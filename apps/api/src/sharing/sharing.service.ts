import { Injectable } from "@nestjs/common";

import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { DocumentsService } from "../documents/documents.service.js";
import { ShareScope } from "../generated/prisma/client.js";
import { LettersService } from "../letters/letters.service.js";
import type { CreateShareDto } from "./dto/create-share.dto.js";
import type { ListRecipientsQueryDto } from "./dto/list-recipients-query.dto.js";
import {
  shareAlreadyExists,
  shareAlreadyRevoked,
  shareAssignmentInvalid,
  shareNotFound,
} from "./sharing.errors.js";
import {
  SharingRepository,
  type ShareRecord,
} from "./infrastructure/sharing.repository.js";
import type {
  ShareRecipientOption,
  ShareResponse,
} from "./sharing.contracts.js";

function toResponse(share: ShareRecord): ShareResponse {
  return {
    id: share.id,
    letterId: share.letterId,
    documentId: share.documentId,
    recipientId: share.recipientId,
    recipientName: share.recipientName,
    allEmployees: share.allEmployees,
    scope: share.scope,
    sharedById: share.sharedById,
    sharedByName: share.sharedByName,
    createdAt: share.createdAt.toISOString(),
    revokedAt: share.revokedAt?.toISOString() ?? null,
    revokedById: share.revokedById,
    revokedByName: share.revokedByName,
  };
}

/**
 * Creates and revokes shares on letters/documents, and resolves recipient
 * candidates. Authorization for a specific letter/document is delegated to
 * `LettersService.authorize`/`DocumentsService.authorize` (the same
 * `letter.share`/`document.share`-gated, HR-Executive-Officer-manager-or-
 * Super-Admin boundary those services already enforce elsewhere) - this
 * service never re-implements that check. Reading what is shared with the
 * *caller themselves* is a wholly separate, independent path, not owned by
 * this service (see the Shared-with-Me surface).
 */
@Injectable()
export class SharingService {
  constructor(
    private readonly repository: SharingRepository,
    private readonly permissions: PermissionsService,
    private readonly letters: LettersService,
    private readonly documents: DocumentsService,
  ) {}

  private async requireAnyShareGrant(actingUserId: string): Promise<void> {
    const [canShareLetters, canShareDocuments] = await Promise.all([
      this.permissions.hasGrant(actingUserId, "letter.share", "ORGANIZATION"),
      this.permissions.hasGrant(actingUserId, "document.share", "ORGANIZATION"),
    ]);
    if (canShareLetters || canShareDocuments) return;
    const [canShareLettersDept, canShareDocumentsDept] = await Promise.all([
      this.permissions.hasGrant(actingUserId, "letter.share", "DEPARTMENT"),
      this.permissions.hasGrant(actingUserId, "document.share", "DEPARTMENT"),
    ]);
    if (canShareLettersDept || canShareDocumentsDept) return;
    throw permissionDenied();
  }

  private async resolveAudience(
    dto: CreateShareDto,
  ): Promise<{ recipientId: string | null; allEmployees: boolean }> {
    const hasRecipient = Boolean(dto.recipientId);
    const hasAllEmployees = dto.allEmployees === true;
    if (hasRecipient === hasAllEmployees) {
      throw shareAssignmentInvalid(
        "Choose exactly one audience: a specific employee or all employees.",
      );
    }
    if (hasRecipient) {
      const activeId = await this.repository.findActiveUserId(dto.recipientId!);
      if (!activeId) {
        throw shareAssignmentInvalid(
          "That employee does not exist or is no longer active.",
        );
      }
      return { recipientId: activeId, allEmployees: false };
    }
    return { recipientId: null, allEmployees: true };
  }

  async shareLetter(
    actingUserId: string,
    letterId: string,
    dto: CreateShareDto,
    requestId: string,
  ): Promise<ShareResponse> {
    await this.letters.authorize(actingUserId, letterId, "letter.share");
    const audience = await this.resolveAudience(dto);
    const created = await this.repository.createForLetter(
      letterId,
      { ...audience, scope: dto.scope ?? ShareScope.VIEW },
      actingUserId,
      requestId,
    );
    if (created === "duplicate") throw shareAlreadyExists();
    return toResponse(created);
  }

  async shareDocument(
    actingUserId: string,
    documentId: string,
    dto: CreateShareDto,
    requestId: string,
  ): Promise<ShareResponse> {
    await this.documents.authorize(actingUserId, documentId, "document.share");
    const audience = await this.resolveAudience(dto);
    const created = await this.repository.createForDocument(
      documentId,
      { ...audience, scope: dto.scope ?? ShareScope.VIEW },
      actingUserId,
      requestId,
    );
    if (created === "duplicate") throw shareAlreadyExists();
    return toResponse(created);
  }

  async listLetterShares(
    actingUserId: string,
    letterId: string,
  ): Promise<ShareResponse[]> {
    await this.letters.authorize(actingUserId, letterId, "letter.share");
    const shares = await this.repository.listActiveForLetter(letterId);
    return shares.map(toResponse);
  }

  async listDocumentShares(
    actingUserId: string,
    documentId: string,
  ): Promise<ShareResponse[]> {
    await this.documents.authorize(actingUserId, documentId, "document.share");
    const shares = await this.repository.listActiveForDocument(documentId);
    return shares.map(toResponse);
  }

  async revoke(
    actingUserId: string,
    shareId: string,
    requestId: string,
  ): Promise<void> {
    const share = await this.repository.findById(shareId);
    if (!share) throw shareNotFound();
    if (share.letterId) {
      await this.letters.authorize(
        actingUserId,
        share.letterId,
        "letter.share",
      );
    } else if (share.documentId) {
      await this.documents.authorize(
        actingUserId,
        share.documentId,
        "document.share",
      );
    } else {
      throw shareNotFound();
    }
    const result = await this.repository.revoke(
      shareId,
      actingUserId,
      requestId,
    );
    if (result === "not_found") throw shareNotFound();
    if (result === "already_revoked") throw shareAlreadyRevoked();
  }

  async searchRecipients(
    actingUserId: string,
    query: ListRecipientsQueryDto,
  ): Promise<ShareRecipientOption[]> {
    await this.requireAnyShareGrant(actingUserId);
    const rows = await this.repository.searchRecipients(
      query.search?.trim() || undefined,
      query.limit,
    );
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      name:
        [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email,
    }));
  }
}
