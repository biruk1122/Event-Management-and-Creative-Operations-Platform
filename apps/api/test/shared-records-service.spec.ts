import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

import { SharedRecordsService } from "../src/shared-records/shared-records.service.js";
import type { LetterRecord } from "../src/letters/infrastructure/letters.repository.js";
import type { DocumentRecord } from "../src/documents/infrastructure/documents.repository.js";

const ACTOR = "actor-1";

function makeLetter(overrides: Partial<LetterRecord> = {}): LetterRecord {
  return {
    id: "letter-1",
    referenceNumber: "LELA-CAST-2026-001",
    direction: "INCOMING",
    category: "CAST",
    date: new Date("2026-01-01T00:00:00Z"),
    projectId: null,
    projectName: null,
    subject: "Subject",
    fromParty: "Sender Co.",
    toParty: null,
    senderReferenceNumber: null,
    shortDescription: null,
    remark: null,
    attachmentCount: 0,
    createdById: "hr-manager-1",
    createdByName: "HR Manager",
    updatedById: "hr-manager-1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

function makeDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: "document-1",
    displayName: "Vendor contract",
    documentType: "CONTRACT",
    projectId: null,
    projectName: null,
    sourceLetterId: null,
    sourceLetterReferenceNumber: null,
    description: null,
    uploadedById: "hr-manager-1",
    uploadedByName: "HR Manager",
    managedFileId: "file-1",
    fileAvailable: true,
    originalFilename: "contract.pdf",
    sizeBytes: 1024,
    uploadedAt: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
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

describe("SharedRecordsService", () => {
  let sharing: {
    listSharedLetterIds: ReturnType<typeof vi.fn>;
    listSharedDocumentIds: ReturnType<typeof vi.fn>;
    findActiveForLetterAndUser: ReturnType<typeof vi.fn>;
    findActiveForDocumentAndUser: ReturnType<typeof vi.fn>;
  };
  let letters: {
    list: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    listAttachmentFileIds: ReturnType<typeof vi.fn>;
    hasAttachment: ReturnType<typeof vi.fn>;
  };
  let documents: {
    list: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    getManagedFileId: ReturnType<typeof vi.fn>;
  };
  let service: SharedRecordsService;

  beforeEach(() => {
    sharing = {
      listSharedLetterIds: vi.fn().mockResolvedValue([]),
      listSharedDocumentIds: vi.fn().mockResolvedValue([]),
      findActiveForLetterAndUser: vi.fn().mockResolvedValue(null),
      findActiveForDocumentAndUser: vi.fn().mockResolvedValue(null),
    };
    letters = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findById: vi.fn().mockResolvedValue(null),
      listAttachmentFileIds: vi
        .fn()
        .mockResolvedValue({ fileIds: [], total: 0 }),
      hasAttachment: vi.fn().mockResolvedValue(false),
    };
    documents = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findById: vi.fn().mockResolvedValue(null),
      getManagedFileId: vi.fn().mockResolvedValue(null),
    };
    service = new SharedRecordsService(
      sharing as never,
      letters as never,
      documents as never,
    );
  });

  describe("listLetters", () => {
    it("short-circuits with an empty page when nothing is shared", async () => {
      const result = await service.listLetters(ACTOR, {
        sort: "date",
        order: "desc",
        page: 1,
        pageSize: 20,
      });
      expect(result).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
      expect(letters.list).not.toHaveBeenCalled();
    });

    it("restricts the letters list to the shared id set", async () => {
      sharing.listSharedLetterIds.mockResolvedValue(["letter-1"]);
      letters.list.mockResolvedValue({ items: [makeLetter()], total: 1 });
      const result = await service.listLetters(ACTOR, {
        sort: "date",
        order: "desc",
        page: 1,
        pageSize: 20,
      });
      expect(letters.list).toHaveBeenCalledWith(
        expect.objectContaining({ ids: ["letter-1"] }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.referenceNumber).toBe("LELA-CAST-2026-001");
    });
  });

  describe("getLetter", () => {
    it("404s when the caller has no active share for that letter", async () => {
      await expectCode(
        service.getLetter(ACTOR, "letter-1"),
        "SHARED_RECORD_NOT_FOUND",
      );
      expect(letters.findById).not.toHaveBeenCalled();
    });

    it("returns the letter with the caller's current share scope", async () => {
      sharing.findActiveForLetterAndUser.mockResolvedValue({
        scope: "VIEW_AND_DOWNLOAD",
      });
      letters.findById.mockResolvedValue(makeLetter());
      const result = await service.getLetter(ACTOR, "letter-1");
      expect(result.shareScope).toBe("VIEW_AND_DOWNLOAD");
      expect(result.referenceNumber).toBe("LELA-CAST-2026-001");
    });
  });

  describe("getDocument", () => {
    it("404s when the caller has no active share for that document", async () => {
      await expectCode(
        service.getDocument(ACTOR, "document-1"),
        "SHARED_RECORD_NOT_FOUND",
      );
    });

    it("returns the document with the caller's current share scope", async () => {
      sharing.findActiveForDocumentAndUser.mockResolvedValue({ scope: "VIEW" });
      documents.findById.mockResolvedValue(makeDocument());
      const result = await service.getDocument(ACTOR, "document-1");
      expect(result.shareScope).toBe("VIEW");
      expect(result.displayName).toBe("Vendor contract");
    });
  });

  describe("shared attachment contract", () => {
    it("readSharedLetterAttachmentContext 404s a VIEW-only share", async () => {
      sharing.findActiveForLetterAndUser.mockResolvedValue({ scope: "VIEW" });
      await expectCode(
        service.readSharedLetterAttachmentContext(ACTOR, "letter-1", "file-1"),
        "SHARED_RECORD_NOT_FOUND",
      );
      expect(letters.hasAttachment).not.toHaveBeenCalled();
    });

    it("readSharedLetterAttachmentContext matches a VIEW_AND_DOWNLOAD share's attachment", async () => {
      sharing.findActiveForLetterAndUser.mockResolvedValue({
        scope: "VIEW_AND_DOWNLOAD",
      });
      letters.hasAttachment.mockResolvedValue(true);
      await expect(
        service.readSharedLetterAttachmentContext(ACTOR, "letter-1", "file-1"),
      ).resolves.toEqual({});
    });

    it("readSharedDocumentFileId returns null for a VIEW-only share", async () => {
      sharing.findActiveForDocumentAndUser.mockResolvedValue({ scope: "VIEW" });
      await expect(
        service.readSharedDocumentFileId(ACTOR, "document-1"),
      ).resolves.toBeNull();
      expect(documents.getManagedFileId).not.toHaveBeenCalled();
    });

    it("readSharedDocumentFileId resolves the file for a VIEW_AND_DOWNLOAD share", async () => {
      sharing.findActiveForDocumentAndUser.mockResolvedValue({
        scope: "VIEW_AND_DOWNLOAD",
      });
      documents.getManagedFileId.mockResolvedValue("file-1");
      await expect(
        service.readSharedDocumentFileId(ACTOR, "document-1"),
      ).resolves.toBe("file-1");
    });
  });
});
