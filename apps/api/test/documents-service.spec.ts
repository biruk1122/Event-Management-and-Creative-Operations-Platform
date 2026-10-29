import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentsService } from "../src/documents/documents.service.js";
import type { DocumentRecord } from "../src/documents/infrastructure/documents.repository.js";
import type { DepartmentAccessContext } from "../src/common/security/department-access.policy.js";

const ACTOR = "actor-1";

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
    managedFileId: null,
    fileAvailable: false,
    originalFilename: null,
    sizeBytes: null,
    uploadedAt: null,
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

const SUPER_ADMIN_CONTEXT: DepartmentAccessContext = {
  role: "SUPER_ADMIN",
  department: null,
};
const HR_MANAGER_CONTEXT: DepartmentAccessContext = {
  role: "DEPARTMENT_MANAGER",
  department: { id: "dept-hr", name: "HR & Executive Officer", active: true },
};
const MARKETING_MANAGER_CONTEXT: DepartmentAccessContext = {
  role: "DEPARTMENT_MANAGER",
  department: { id: "dept-marketing", name: "Marketing", active: true },
};

describe("DocumentsService", () => {
  let repository: {
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    softDelete: ReturnType<typeof vi.fn>;
    lockAttachmentAccess: ReturnType<typeof vi.fn>;
    setManagedFile: ReturnType<typeof vi.fn>;
    getManagedFileId: ReturnType<typeof vi.fn>;
  };
  let permissions: {
    getAccessContext: ReturnType<typeof vi.fn>;
    hasGrant: ReturnType<typeof vi.fn>;
  };
  let db: {
    project: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let service: DocumentsService;

  beforeEach(() => {
    repository = {
      create: vi.fn(),
      findById: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      lockAttachmentAccess: vi.fn(),
      setManagedFile: vi.fn(),
      getManagedFileId: vi.fn(),
    };
    permissions = {
      getAccessContext: vi.fn().mockResolvedValue(SUPER_ADMIN_CONTEXT),
      hasGrant: vi.fn().mockResolvedValue(true),
    };
    db = {
      project: {
        findUnique: vi.fn().mockResolvedValue({ id: "project-1" }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    service = new DocumentsService(
      repository as never,
      permissions as never,
      db as never,
    );
  });

  describe("access boundary", () => {
    it("allows a Super Admin holding document.read at organization scope", async () => {
      repository.list.mockResolvedValue({ items: [], total: 0 });
      await expect(
        service.list(ACTOR, {
          sort: "createdAt",
          order: "desc",
          page: 1,
          pageSize: 20,
        }),
      ).resolves.toMatchObject({ total: 0 });
    });

    it("denies a Super Admin who somehow lacks the organization grant", async () => {
      permissions.hasGrant.mockResolvedValueOnce(false);
      await expectCode(
        service.list(ACTOR, {
          sort: "createdAt",
          order: "desc",
          page: 1,
          pageSize: 20,
        }),
        "PERMISSION_DENIED",
      );
      expect(repository.list).not.toHaveBeenCalled();
    });

    it("allows the HR & Executive Officer department's own manager", async () => {
      permissions.getAccessContext.mockResolvedValue(HR_MANAGER_CONTEXT);
      repository.list.mockResolvedValue({ items: [], total: 0 });
      await expect(
        service.list(ACTOR, {
          sort: "createdAt",
          order: "desc",
          page: 1,
          pageSize: 20,
        }),
      ).resolves.toMatchObject({ total: 0 });
    });

    it("denies a Department Manager of any other department, even holding the grant", async () => {
      permissions.getAccessContext.mockResolvedValue(MARKETING_MANAGER_CONTEXT);
      await expectCode(
        service.list(ACTOR, {
          sort: "createdAt",
          order: "desc",
          page: 1,
          pageSize: 20,
        }),
        "PERMISSION_DENIED",
      );
      expect(repository.list).not.toHaveBeenCalled();
    });

    it("applies the same boundary to get/create/update", async () => {
      permissions.getAccessContext.mockResolvedValue(MARKETING_MANAGER_CONTEXT);
      await expectCode(service.get(ACTOR, "document-1"), "PERMISSION_DENIED");
      await expectCode(
        service.create(
          ACTOR,
          { displayName: "Doc", documentType: "INVOICE" },
          "req-1",
        ),
        "PERMISSION_DENIED",
      );
      await expectCode(
        service.update(
          ACTOR,
          "document-1",
          { displayName: "Renamed" },
          "req-1",
        ),
        "PERMISSION_DENIED",
      );
      expect(repository.findById).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("gates delete on the organization-scope document.delete grant alone, not the HR check", async () => {
      permissions.getAccessContext.mockResolvedValue(HR_MANAGER_CONTEXT);
      permissions.hasGrant.mockResolvedValue(false);
      await expectCode(
        service.remove(ACTOR, "document-1", "req-1"),
        "PERMISSION_DENIED",
      );
      expect(repository.softDelete).not.toHaveBeenCalled();
    });
  });

  describe("create", () => {
    it("creates a file-less shell via the repository", async () => {
      repository.create.mockResolvedValue(makeDocument());
      const result = await service.create(
        ACTOR,
        { displayName: "Vendor contract", documentType: "CONTRACT" },
        "req-1",
      );
      expect(result.fileAvailable).toBe(false);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: "Vendor contract" }),
        ACTOR,
        "req-1",
      );
    });

    it("rejects a project that does not exist", async () => {
      db.project.findUnique.mockResolvedValue(null);
      await expect(
        service.create(
          ACTOR,
          {
            displayName: "Doc",
            documentType: "INVOICE",
            projectId: "missing-project",
          },
          "req-1",
        ),
      ).rejects.toBeInstanceOf(HttpException);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("rejects moving a letter-sourced document away from type Letter", async () => {
      repository.findById.mockResolvedValue(
        makeDocument({ sourceLetterId: "letter-1", documentType: "LETTER" }),
      );
      await expect(
        service.update(
          ACTOR,
          "document-1",
          { documentType: "INVOICE" },
          "req-1",
        ),
      ).rejects.toBeInstanceOf(HttpException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it("allows renaming a letter-sourced document while keeping type Letter", async () => {
      repository.findById.mockResolvedValue(
        makeDocument({ sourceLetterId: "letter-1", documentType: "LETTER" }),
      );
      repository.update.mockResolvedValue(
        makeDocument({
          sourceLetterId: "letter-1",
          documentType: "LETTER",
          displayName: "Renamed",
        }),
      );
      const result = await service.update(
        ACTOR,
        "document-1",
        { displayName: "Renamed" },
        "req-1",
      );
      expect(result.displayName).toBe("Renamed");
    });

    it("allows changing type freely on a document with no source letter", async () => {
      repository.findById.mockResolvedValue(makeDocument());
      repository.update.mockResolvedValue(
        makeDocument({ documentType: "PRICE_QUOTATION" }),
      );
      const result = await service.update(
        ACTOR,
        "document-1",
        { documentType: "PRICE_QUOTATION" },
        "req-1",
      );
      expect(result.documentType).toBe("PRICE_QUOTATION");
    });
  });

  describe("attachment contract", () => {
    it("lockAttachmentFinalization rejects an already-attached document", async () => {
      repository.lockAttachmentAccess.mockResolvedValue("already_attached");
      await expectCode(
        service.lockAttachmentFinalization(undefined as never, {
          actingUserId: ACTOR,
          documentId: "document-1",
        }),
        "DOCUMENT_ALREADY_HAS_FILE",
      );
    });

    it("lockAttachmentFinalization rejects a missing document", async () => {
      repository.lockAttachmentAccess.mockResolvedValue("not_found");
      await expectCode(
        service.lockAttachmentFinalization(undefined as never, {
          actingUserId: ACTOR,
          documentId: "document-1",
        }),
        "DOCUMENT_NOT_FOUND",
      );
    });

    it("readAttachmentContext matches only the document's own file id", async () => {
      repository.findById.mockResolvedValue(makeDocument());
      repository.getManagedFileId.mockResolvedValue("file-1");
      await expect(
        service.readAttachmentContext(ACTOR, "document-1", "file-1"),
      ).resolves.toEqual({});
      await expect(
        service.readAttachmentContext(ACTOR, "document-1", "file-2"),
      ).resolves.toBeNull();
    });
  });
});
