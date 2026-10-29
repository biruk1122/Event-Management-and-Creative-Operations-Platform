import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PartnersService } from "../src/partners/partners.service.js";
import type {
  PartnerActivityRecord,
  PartnerRecord,
} from "../src/partners/infrastructure/partners.repository.js";
import type { PermissionScope } from "../src/generated/prisma/client.js";

const ACTOR = "actor-1";

function makePerson(overrides: Partial<{ id: string }> = {}) {
  return {
    id: "user-1",
    email: "dana@example.com",
    firstName: "Dana",
    lastName: "Okafor",
    ...overrides,
  };
}

function makePartner(overrides: Partial<PartnerRecord> = {}): PartnerRecord {
  return {
    id: "ptn-1",
    organizationName: "Northbridge Media",
    category: "Media",
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    departmentId: null,
    campaignId: null,
    eventId: null,
    status: "PROSPECTIVE",
    proposedContribution: null,
    notes: null,
    followUpAt: null,
    owner: null,
    createdBy: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

function makeActivity(
  overrides: Partial<PartnerActivityRecord> = {},
): PartnerActivityRecord {
  return {
    id: "pact-1",
    partnerId: "ptn-1",
    author: null,
    note: "Sent the deck.",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
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

describe("PartnersService", () => {
  let repository: {
    list: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findUserDepartmentId: ReturnType<typeof vi.fn>;
    departmentExists: ReturnType<typeof vi.fn>;
    listEligibleOwners: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    listActivities: ReturnType<typeof vi.fn>;
    createActivity: ReturnType<typeof vi.fn>;
  };
  let permissions: {
    hasGrant: ReturnType<
      typeof vi.fn<
        (u: string, k: string, s: PermissionScope) => Promise<boolean>
      >
    >;
  };
  let service: PartnersService;

  beforeEach(() => {
    repository = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findById: vi.fn().mockResolvedValue(makePartner()),
      findUserDepartmentId: vi.fn().mockResolvedValue(null),
      departmentExists: vi.fn().mockResolvedValue(true),
      listEligibleOwners: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(makePartner()),
      update: vi.fn().mockResolvedValue(makePartner()),
      listActivities: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      createActivity: vi.fn().mockResolvedValue(makeActivity()),
    };
    permissions = { hasGrant: vi.fn().mockResolvedValue(true) };
    service = new PartnersService(repository as never, permissions as never);
  });

  function grantOnly(...allowed: [string, PermissionScope][]): void {
    permissions.hasGrant.mockImplementation((_userId, key, scope) =>
      Promise.resolve(allowed.some(([k, s]) => k === key && s === scope)),
    );
  }

  describe("authorization follows the org/department/self idiom", () => {
    it.each([
      [
        "list",
        (s: PartnersService) => s.list(ACTOR, { page: 1, pageSize: 25 }),
      ],
      ["get", (s: PartnersService) => s.get(ACTOR, "ptn-1")],
      [
        "create",
        (s: PartnersService) =>
          s.create(ACTOR, { organizationName: "x", category: "Media" }),
      ],
      ["update", (s: PartnersService) => s.update(ACTOR, "ptn-1", {})],
      [
        "listActivities",
        (s: PartnersService) =>
          s.listActivities(ACTOR, "ptn-1", { page: 1, pageSize: 25 }),
      ],
      [
        "createActivity",
        (s: PartnersService) => s.createActivity(ACTOR, "ptn-1", { note: "x" }),
      ],
    ] as const)("%s is denied without any grant", async (_label, call) => {
      grantOnly();
      await expectCode(call(service), "PERMISSION_DENIED");
    });

    it("an organization-scoped caller (Super Admin) sees every partner", async () => {
      grantOnly(["partner.read", "ORGANIZATION"]);
      await service.list(ACTOR, { page: 1, pageSize: 25 });
      expect(repository.list).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: { organization: true } }),
      );
    });

    it("a department-scoped caller (the Manager) only sees their own department's partners", async () => {
      grantOnly(["partner.read", "DEPARTMENT"]);
      repository.findUserDepartmentId.mockResolvedValue("department-1");
      await service.list(ACTOR, { page: 1, pageSize: 25 });
      expect(repository.list).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: { organization: false, departmentId: "department-1" },
        }),
      );
    });

    it("a self-scoped caller (a Team Member) only sees partners they own", async () => {
      grantOnly(["partner.read", "SELF"]);
      await service.list(ACTOR, { page: 1, pageSize: 25 });
      expect(repository.list).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: { organization: false, selfUserId: ACTOR },
        }),
      );
    });

    it("a department manager cannot read a partner outside their own department", async () => {
      grantOnly(["partner.read", "DEPARTMENT"]);
      repository.findUserDepartmentId.mockResolvedValue("department-1");
      repository.findById.mockResolvedValue(
        makePartner({ departmentId: "department-2" }),
      );
      await expectCode(service.get(ACTOR, "ptn-1"), "PERMISSION_DENIED");
    });

    it("a team member cannot read a partner they do not own", async () => {
      grantOnly(["partner.read", "SELF"]);
      repository.findById.mockResolvedValue(
        makePartner({ owner: makePerson({ id: "someone-else" }) }),
      );
      await expectCode(service.get(ACTOR, "ptn-1"), "PERMISSION_DENIED");
    });

    it("a team member can read and add an activity to a partner they own", async () => {
      grantOnly(["partner.read", "SELF"], ["partner.activity.create", "SELF"]);
      repository.findById.mockResolvedValue(
        makePartner({ owner: makePerson({ id: ACTOR }) }),
      );
      await expect(service.get(ACTOR, "ptn-1")).resolves.toMatchObject({
        id: "ptn-1",
      });
      await service.createActivity(ACTOR, "ptn-1", { note: "  Hello  " });
      expect(repository.createActivity).toHaveBeenCalledWith("ptn-1", {
        authorId: ACTOR,
        note: "Hello",
      });
    });

    it("a team member cannot create or update a partner (no create/update grant at any scope)", async () => {
      grantOnly(["partner.read", "SELF"], ["partner.activity.create", "SELF"]);
      await expectCode(
        service.create(ACTOR, { organizationName: "x", category: "Media" }),
        "PERMISSION_DENIED",
      );
      await expectCode(service.update(ACTOR, "ptn-1", {}), "PERMISSION_DENIED");
    });

    it("never reveals existence of an out-of-scope partner, but 404s for an organization-scoped caller", async () => {
      repository.findById.mockResolvedValue(null);
      grantOnly();
      await expectCode(service.get(ACTOR, "nope"), "PERMISSION_DENIED");

      grantOnly(["partner.read", "ORGANIZATION"]);
      await expectCode(service.get(ACTOR, "nope"), "PARTNER_NOT_FOUND");
    });
  });

  describe("create policy", () => {
    it("trims text and stamps the acting user as creator", async () => {
      grantOnly(["partner.create", "ORGANIZATION"]);
      await service.create(ACTOR, {
        organizationName: "  Northbridge  ",
        category: "  Media  ",
        contactName: "  Dana  ",
        notes: "  Big deal.  ",
      });

      expect(repository.create).toHaveBeenCalledWith({
        organizationName: "Northbridge",
        category: "Media",
        createdById: ACTOR,
        contactName: "Dana",
        notes: "Big deal.",
      });
    });

    it("forces a department-scoped caller's own department, ignoring any client-supplied one", async () => {
      grantOnly(["partner.create", "DEPARTMENT"]);
      repository.findUserDepartmentId.mockResolvedValue("department-1");
      await service.create(ACTOR, {
        organizationName: "Local Sponsor",
        category: "Sponsor",
        departmentId: "some-other-department",
      });
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ departmentId: "department-1" }),
      );
    });

    it("denies create for a caller with neither organization nor department scope", async () => {
      grantOnly();
      await expectCode(
        service.create(ACTOR, { organizationName: "x", category: "Media" }),
        "PERMISSION_DENIED",
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("404s when the department does not exist", async () => {
      grantOnly(["partner.create", "ORGANIZATION"]);
      repository.departmentExists.mockResolvedValue(false);
      await expectCode(
        service.create(ACTOR, {
          organizationName: "x",
          category: "Media",
          departmentId: "ghost-department",
        }),
        "PARTNER_DEPARTMENT_NOT_FOUND",
      );
    });

    it("rejects an owner outside the partner's department", async () => {
      grantOnly(["partner.create", "DEPARTMENT"]);
      repository.findUserDepartmentId.mockResolvedValue("department-1");
      repository.listEligibleOwners.mockResolvedValue([
        makePerson({ id: "eligible-1" }),
      ]);
      await expectCode(
        service.create(ACTOR, {
          organizationName: "x",
          category: "Media",
          ownerId: "outsider",
        }),
        "PARTNER_OWNER_OUTSIDE_DEPARTMENT",
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("accepts an owner who belongs to the resolved department", async () => {
      grantOnly(["partner.create", "DEPARTMENT"]);
      repository.findUserDepartmentId.mockResolvedValue("department-1");
      repository.listEligibleOwners.mockResolvedValue([
        makePerson({ id: "eligible-1" }),
      ]);
      await service.create(ACTOR, {
        organizationName: "x",
        category: "Media",
        ownerId: "eligible-1",
      });
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: "eligible-1" }),
      );
    });

    it("maps repository failures to stable problem codes", async () => {
      grantOnly(["partner.create", "ORGANIZATION"]);
      repository.create.mockResolvedValueOnce("campaign_not_found");
      await expectCode(
        service.create(ACTOR, { organizationName: "x", category: "Media" }),
        "PARTNER_CAMPAIGN_NOT_FOUND",
      );
      repository.create.mockResolvedValueOnce("event_not_found");
      await expectCode(
        service.create(ACTOR, { organizationName: "x", category: "Media" }),
        "EVENT_NOT_FOUND",
      );
    });
  });

  describe("update policy", () => {
    it("only sends the fields the caller set", async () => {
      await service.update(ACTOR, "ptn-1", {
        organizationName: "  New Name  ",
        notes: null,
      });
      expect(repository.update).toHaveBeenCalledWith("ptn-1", {
        organizationName: "New Name",
        notes: null,
      });
    });

    it("re-validates a changed owner against the partner's existing department", async () => {
      repository.findById.mockResolvedValue(
        makePartner({ departmentId: "department-1" }),
      );
      repository.listEligibleOwners.mockResolvedValue([
        makePerson({ id: "eligible-1" }),
      ]);
      await expectCode(
        service.update(ACTOR, "ptn-1", { ownerId: "outsider" }),
        "PARTNER_OWNER_OUTSIDE_DEPARTMENT",
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it("maps repository not-found outcomes to stable problem codes", async () => {
      repository.update.mockResolvedValueOnce("not_found");
      await expectCode(service.update(ACTOR, "ptn-1", {}), "PARTNER_NOT_FOUND");
      repository.update.mockResolvedValueOnce("campaign_not_found");
      await expectCode(
        service.update(ACTOR, "ptn-1", { campaignId: "ghost" }),
        "PARTNER_CAMPAIGN_NOT_FOUND",
      );
    });
  });

  describe("list", () => {
    it("passes only the filters that were set and echoes the paging", async () => {
      grantOnly(["partner.read", "ORGANIZATION"]);
      repository.list.mockResolvedValue({ items: [makePartner()], total: 9 });

      const page = await service.list(ACTOR, {
        page: 2,
        pageSize: 10,
        status: "COMMITTED",
        search: "  north ",
      });

      expect(repository.list).toHaveBeenCalledWith({
        visibility: { organization: true },
        status: "COMMITTED",
        search: "north",
        page: 2,
        pageSize: 10,
      });
      expect(page).toMatchObject({ page: 2, pageSize: 10, total: 9 });
      expect(page.items).toHaveLength(1);
    });
  });

  describe("activities", () => {
    it("lists a partner's activity log with the paging echoed", async () => {
      repository.listActivities.mockResolvedValue({
        items: [makeActivity()],
        total: 3,
      });
      const page = await service.listActivities(ACTOR, "ptn-1", {
        page: 1,
        pageSize: 25,
      });
      expect(repository.listActivities).toHaveBeenCalledWith("ptn-1", {
        page: 1,
        pageSize: 25,
      });
      expect(page).toMatchObject({ total: 3 });
    });

    it("404s creating an activity under a partner that disappeared", async () => {
      repository.createActivity.mockResolvedValueOnce("partner_not_found");
      await expectCode(
        service.createActivity(ACTOR, "ptn-1", { note: "x" }),
        "PARTNER_NOT_FOUND",
      );
    });
  });
});
