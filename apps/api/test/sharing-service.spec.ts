import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SharingService } from "../src/sharing/sharing.service.js";
import type { ShareRecord } from "../src/sharing/infrastructure/sharing.repository.js";

const ACTOR = "actor-1";
const REQUEST_ID = "req-1";

function makeShare(overrides: Partial<ShareRecord> = {}): ShareRecord {
  return {
    id: "share-1",
    letterId: "letter-1",
    documentId: null,
    recipientId: "recipient-1",
    recipientName: "Recipient Name",
    allEmployees: false,
    scope: "VIEW",
    sharedById: ACTOR,
    sharedByName: "HR Manager",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    revokedAt: null,
    revokedById: null,
    revokedByName: null,
    ...overrides,
  };
}

async function expectCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(HttpException);
  await promise.catch((error: unknown) => {
    const response = (error as HttpException).getResponse() as {
      code?: string;
    };
    expect(response.code).toBe(code);
  });
}

describe("SharingService", () => {
  let repository: {
    createForLetter: ReturnType<typeof vi.fn>;
    createForDocument: ReturnType<typeof vi.fn>;
    listActiveForLetter: ReturnType<typeof vi.fn>;
    listActiveForDocument: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
    searchRecipients: ReturnType<typeof vi.fn>;
    findActiveUserId: ReturnType<typeof vi.fn>;
  };
  let permissions: { hasGrant: ReturnType<typeof vi.fn> };
  let letters: { authorize: ReturnType<typeof vi.fn> };
  let documents: { authorize: ReturnType<typeof vi.fn> };
  let service: SharingService;

  beforeEach(() => {
    repository = {
      createForLetter: vi.fn(),
      createForDocument: vi.fn(),
      listActiveForLetter: vi.fn(),
      listActiveForDocument: vi.fn(),
      findById: vi.fn(),
      revoke: vi.fn(),
      searchRecipients: vi.fn(),
      findActiveUserId: vi.fn().mockResolvedValue("recipient-1"),
    };
    permissions = { hasGrant: vi.fn().mockResolvedValue(true) };
    letters = { authorize: vi.fn().mockResolvedValue(undefined) };
    documents = { authorize: vi.fn().mockResolvedValue(undefined) };
    service = new SharingService(
      repository as never,
      permissions as never,
      letters as never,
      documents as never,
    );
  });

  describe("shareLetter", () => {
    it("delegates authorization to LettersService.authorize with letter.share", async () => {
      repository.createForLetter.mockResolvedValue(makeShare());
      await service.shareLetter(
        ACTOR,
        "letter-1",
        { recipientId: "recipient-1" },
        REQUEST_ID,
      );
      expect(letters.authorize).toHaveBeenCalledWith(
        ACTOR,
        "letter-1",
        "letter.share",
      );
    });

    it("rejects when neither recipientId nor allEmployees is set", async () => {
      await expect(
        service.shareLetter(ACTOR, "letter-1", {}, REQUEST_ID),
      ).rejects.toBeInstanceOf(HttpException);
      expect(repository.createForLetter).not.toHaveBeenCalled();
    });

    it("rejects when both recipientId and allEmployees are set", async () => {
      await expect(
        service.shareLetter(
          ACTOR,
          "letter-1",
          { recipientId: "recipient-1", allEmployees: true },
          REQUEST_ID,
        ),
      ).rejects.toBeInstanceOf(HttpException);
      expect(repository.createForLetter).not.toHaveBeenCalled();
    });

    it("rejects a recipient who does not exist or is inactive", async () => {
      repository.findActiveUserId.mockResolvedValue(null);
      await expect(
        service.shareLetter(
          ACTOR,
          "letter-1",
          { recipientId: "missing-user" },
          REQUEST_ID,
        ),
      ).rejects.toBeInstanceOf(HttpException);
      expect(repository.createForLetter).not.toHaveBeenCalled();
    });

    it("maps a duplicate active share to SHARE_ALREADY_EXISTS", async () => {
      repository.createForLetter.mockResolvedValue("duplicate");
      await expectCode(
        service.shareLetter(
          ACTOR,
          "letter-1",
          { recipientId: "recipient-1" },
          REQUEST_ID,
        ),
        "SHARE_ALREADY_EXISTS",
      );
    });

    it("defaults scope to VIEW when omitted", async () => {
      repository.createForLetter.mockResolvedValue(makeShare());
      await service.shareLetter(
        ACTOR,
        "letter-1",
        { recipientId: "recipient-1" },
        REQUEST_ID,
      );
      expect(repository.createForLetter).toHaveBeenCalledWith(
        "letter-1",
        expect.objectContaining({ scope: "VIEW" }),
        ACTOR,
        REQUEST_ID,
      );
    });

    it("shares with all employees when allEmployees is true", async () => {
      repository.createForLetter.mockResolvedValue(
        makeShare({ recipientId: null, allEmployees: true }),
      );
      await service.shareLetter(
        ACTOR,
        "letter-1",
        { allEmployees: true },
        REQUEST_ID,
      );
      expect(repository.createForLetter).toHaveBeenCalledWith(
        "letter-1",
        { recipientId: null, allEmployees: true, scope: "VIEW" },
        ACTOR,
        REQUEST_ID,
      );
    });
  });

  describe("shareDocument", () => {
    it("delegates authorization to DocumentsService.authorize with document.share", async () => {
      repository.createForDocument.mockResolvedValue(
        makeShare({ letterId: null, documentId: "document-1" }),
      );
      await service.shareDocument(
        ACTOR,
        "document-1",
        { recipientId: "recipient-1" },
        REQUEST_ID,
      );
      expect(documents.authorize).toHaveBeenCalledWith(
        ACTOR,
        "document-1",
        "document.share",
      );
    });
  });

  describe("revoke", () => {
    it("routes a letter-backed share through LettersService.authorize", async () => {
      repository.findById.mockResolvedValue(makeShare());
      repository.revoke.mockResolvedValue("revoked");
      await service.revoke(ACTOR, "share-1", REQUEST_ID);
      expect(letters.authorize).toHaveBeenCalledWith(
        ACTOR,
        "letter-1",
        "letter.share",
      );
      expect(repository.revoke).toHaveBeenCalledWith(
        "share-1",
        ACTOR,
        REQUEST_ID,
      );
    });

    it("routes a document-backed share through DocumentsService.authorize", async () => {
      repository.findById.mockResolvedValue(
        makeShare({ letterId: null, documentId: "document-1" }),
      );
      repository.revoke.mockResolvedValue("revoked");
      await service.revoke(ACTOR, "share-1", REQUEST_ID);
      expect(documents.authorize).toHaveBeenCalledWith(
        ACTOR,
        "document-1",
        "document.share",
      );
    });

    it("rejects revoking a share that does not exist", async () => {
      repository.findById.mockResolvedValue(null);
      await expectCode(
        service.revoke(ACTOR, "missing", REQUEST_ID),
        "SHARE_NOT_FOUND",
      );
    });

    it("rejects revoking an already-revoked share", async () => {
      repository.findById.mockResolvedValue(makeShare());
      repository.revoke.mockResolvedValue("already_revoked");
      await expectCode(
        service.revoke(ACTOR, "share-1", REQUEST_ID),
        "SHARE_ALREADY_REVOKED",
      );
    });

    it("denies revoke when the caller lacks the parent's share authorization", async () => {
      repository.findById.mockResolvedValue(makeShare());
      letters.authorize.mockRejectedValue(
        new HttpException({ code: "PERMISSION_DENIED" }, 403),
      );
      await expectCode(
        service.revoke(ACTOR, "share-1", REQUEST_ID),
        "PERMISSION_DENIED",
      );
      expect(repository.revoke).not.toHaveBeenCalled();
    });
  });

  describe("searchRecipients", () => {
    it("allows a caller holding document.share even without letter.share", async () => {
      // requireAnyShareGrant checks letter.share then document.share (both
      // ORGANIZATION-scope) in that order via Promise.all.
      permissions.hasGrant
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      repository.searchRecipients.mockResolvedValue([]);
      await expect(
        service.searchRecipients(ACTOR, { limit: 20 }),
      ).resolves.toEqual([]);
    });

    it("denies a caller holding neither share grant", async () => {
      permissions.hasGrant.mockResolvedValue(false);
      await expect(
        service.searchRecipients(ACTOR, { limit: 20 }),
      ).rejects.toBeInstanceOf(HttpException);
      expect(repository.searchRecipients).not.toHaveBeenCalled();
    });
  });
});
