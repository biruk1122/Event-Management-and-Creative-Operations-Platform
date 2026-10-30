import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LetterRecord } from "../src/letters/infrastructure/letters.repository.js";
import { LettersService } from "../src/letters/letters.service.js";
import type { DepartmentAccessContext } from "../src/common/security/department-access.policy.js";

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
const DEPARTMENT_MEMBER_CONTEXT: DepartmentAccessContext = {
  role: "DEPARTMENT_MEMBER",
  department: { id: "dept-hr", name: "HR & Executive Officer", active: true },
};

describe("LettersService", () => {
  let repository: {
    previewNextSequence: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    softDelete: ReturnType<typeof vi.fn>;
    listRemarks: ReturnType<typeof vi.fn>;
    addRemark: ReturnType<typeof vi.fn>;
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
  let service: LettersService;

  beforeEach(() => {
    repository = {
      previewNextSequence: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      listRemarks: vi.fn(),
      addRemark: vi.fn(),
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
    service = new LettersService(
      repository as never,
      permissions as never,
      db as never,
    );
  });

  describe("access boundary", () => {
    it("allows a Super Admin holding letter.read at organization scope", async () => {
      repository.list.mockResolvedValue({ items: [], total: 0 });
      await expect(
        service.list(ACTOR, {
          sort: "date",
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
          sort: "date",
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
          sort: "date",
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
          sort: "date",
          order: "desc",
          page: 1,
          pageSize: 20,
        }),
        "PERMISSION_DENIED",
      );
      expect(repository.list).not.toHaveBeenCalled();
    });

    it("denies a plain Department Member in the HR department", async () => {
      permissions.getAccessContext.mockResolvedValue(DEPARTMENT_MEMBER_CONTEXT);
      await expectCode(
        service.list(ACTOR, {
          sort: "date",
          order: "desc",
          page: 1,
          pageSize: 20,
        }),
        "PERMISSION_DENIED",
      );
    });

    it("applies the same boundary to get/create/update", async () => {
      permissions.getAccessContext.mockResolvedValue(MARKETING_MANAGER_CONTEXT);
      await expectCode(service.get(ACTOR, "letter-1"), "PERMISSION_DENIED");
      await expectCode(
        service.create(
          ACTOR,
          {
            direction: "INCOMING",
            category: "CAST",
            date: "2026-01-01",
            subject: "Subject",
            fromParty: "Sender",
          },
          "req-1",
        ),
        "PERMISSION_DENIED",
      );
      await expectCode(
        service.update(ACTOR, "letter-1", { subject: "New subject" }, "req-1"),
        "PERMISSION_DENIED",
      );
      expect(repository.findById).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("gates delete on the organization-scope letter.delete grant alone, not the HR check", async () => {
      permissions.getAccessContext.mockResolvedValue(HR_MANAGER_CONTEXT);
      permissions.hasGrant.mockResolvedValue(false);
      await expectCode(
        service.remove(ACTOR, "letter-1", "req-1"),
        "PERMISSION_DENIED",
      );
      expect(repository.softDelete).not.toHaveBeenCalled();
    });
  });

  describe("create", () => {
    it("generates the reference number via the repository and returns it", async () => {
      repository.create.mockResolvedValue(
        makeLetter({ referenceNumber: "LELA-CAST-2026-007" }),
      );
      const result = await service.create(
        ACTOR,
        {
          direction: "INCOMING",
          category: "CAST",
          date: "2026-01-01",
          subject: "Subject",
          fromParty: "Sender",
        },
        "req-1",
      );
      expect(result.referenceNumber).toBe("LELA-CAST-2026-007");
      expect(repository.create).toHaveBeenCalledWith(
        "LELA",
        expect.any(Number),
        expect.objectContaining({ category: "CAST", direction: "INCOMING" }),
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
            direction: "INCOMING",
            category: "CAST",
            date: "2026-01-01",
            subject: "Subject",
            fromParty: "Sender",
            projectId: "missing-project",
          },
          "req-1",
        ),
      ).rejects.toBeInstanceOf(HttpException);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("rejects editing toParty on an incoming letter", async () => {
      repository.findById.mockResolvedValue(
        makeLetter({ direction: "INCOMING" }),
      );
      await expect(
        service.update(ACTOR, "letter-1", { toParty: "Someone" }, "req-1"),
      ).rejects.toBeInstanceOf(HttpException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it("rejects editing fromParty on an outgoing letter", async () => {
      repository.findById.mockResolvedValue(
        makeLetter({
          direction: "OUTGOING",
          fromParty: null,
          toParty: "Recipient",
        }),
      );
      await expect(
        service.update(ACTOR, "letter-1", { fromParty: "Someone" }, "req-1"),
      ).rejects.toBeInstanceOf(HttpException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it("rejects a sender reference number on an outgoing letter", async () => {
      repository.findById.mockResolvedValue(
        makeLetter({
          direction: "OUTGOING",
          fromParty: null,
          toParty: "Recipient",
        }),
      );
      await expect(
        service.update(
          ACTOR,
          "letter-1",
          { senderReferenceNumber: "X-1" },
          "req-1",
        ),
      ).rejects.toBeInstanceOf(HttpException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it("never accepts direction or category - the DTO itself has no such fields", async () => {
      repository.findById.mockResolvedValue(makeLetter());
      repository.update.mockResolvedValue(makeLetter({ subject: "Updated" }));
      const result = await service.update(
        ACTOR,
        "letter-1",
        { subject: "Updated" },
        "req-1",
      );
      expect(result.subject).toBe("Updated");
      expect(result.referenceNumber).toBe("LELA-CAST-2026-001");
    });
  });

  describe("remarks", () => {
    it("requires letter-management authorization to read remarks, not a separate share", async () => {
      permissions.getAccessContext.mockResolvedValue(MARKETING_MANAGER_CONTEXT);
      await expectCode(
        service.listRemarks(ACTOR, "letter-1"),
        "PERMISSION_DENIED",
      );
      expect(repository.listRemarks).not.toHaveBeenCalled();
    });

    it("adds a remark for an authorized caller", async () => {
      repository.addRemark.mockResolvedValue({
        id: "remark-1",
        letterId: "letter-1",
        authorId: ACTOR,
        authorName: "HR Manager",
        body: "Noted",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      });
      const result = await service.addRemark(ACTOR, "letter-1", {
        body: "Noted",
      });
      expect(result.body).toBe("Noted");
    });
  });
});
