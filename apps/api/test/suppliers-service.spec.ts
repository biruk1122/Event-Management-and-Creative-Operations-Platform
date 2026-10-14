import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PermissionScope } from "../src/generated/prisma/client.js";
import type { SupplierRecord } from "../src/suppliers/infrastructure/suppliers.repository.js";
import { SuppliersService } from "../src/suppliers/suppliers.service.js";

const ACTOR = "actor-1";

function makeSupplier(overrides: Partial<SupplierRecord> = {}): SupplierRecord {
  return {
    id: "sup-1",
    name: "Grand Hall Catering",
    category: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    departmentId: null,
    status: "ACTIVE",
    notes: null,
    createdById: ACTOR,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
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

describe("SuppliersService", () => {
  let repo: {
    findUserDepartmentId: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let permissions: { getEffectiveGrants: ReturnType<typeof vi.fn> };
  let service: SuppliersService;

  beforeEach(() => {
    repo = {
      findUserDepartmentId: vi.fn().mockResolvedValue(null),
      findById: vi.fn().mockResolvedValue(makeSupplier()),
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      create: vi.fn().mockResolvedValue(makeSupplier()),
      update: vi.fn().mockResolvedValue(makeSupplier()),
    };
    permissions = { getEffectiveGrants: vi.fn().mockResolvedValue([]) };
    service = new SuppliersService(repo as never, permissions as never);
  });

  function grantOnly(...allowed: [string, PermissionScope][]): void {
    permissions.getEffectiveGrants.mockResolvedValue(
      allowed.map(([permissionKey, scope]) => ({ permissionKey, scope })),
    );
  }

  it("denies create without supplier.create", async () => {
    grantOnly();
    await expectCode(service.create(ACTOR, { name: "x" }), "PERMISSION_DENIED");
  });

  it("a department-scoped caller creates a private, department-owned entry", async () => {
    grantOnly(["supplier.create", "DEPARTMENT"]);
    repo.findUserDepartmentId.mockResolvedValue("dept-1");
    await service.create(ACTOR, { name: "Local Caterer" });
    expect(repo.create).toHaveBeenCalledWith(
      "dept-1",
      expect.objectContaining({ name: "Local Caterer" }),
    );
  });

  it("an organization-scoped caller creates a shared, department-less entry", async () => {
    grantOnly(["supplier.create", "ORGANIZATION"]);
    await service.create(ACTOR, { name: "Shared Vendor" });
    expect(repo.create).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ name: "Shared Vendor" }),
    );
  });

  describe("visibility", () => {
    it("a shared (department-less) supplier is visible to every department-scoped caller", async () => {
      grantOnly(["supplier.read", "DEPARTMENT"]);
      repo.findUserDepartmentId.mockResolvedValue("dept-1");
      repo.findById.mockResolvedValue(makeSupplier({ departmentId: null }));
      await expect(service.get(ACTOR, "sup-1")).resolves.toBeDefined();
    });

    it("a private supplier is denied to a different department's caller", async () => {
      grantOnly(["supplier.read", "DEPARTMENT"]);
      repo.findUserDepartmentId.mockResolvedValue("dept-2");
      repo.findById.mockResolvedValue(makeSupplier({ departmentId: "dept-1" }));
      await expectCode(service.get(ACTOR, "sup-1"), "PERMISSION_DENIED");
    });

    it("a private supplier is visible to its own department's caller", async () => {
      grantOnly(["supplier.read", "DEPARTMENT"]);
      repo.findUserDepartmentId.mockResolvedValue("dept-1");
      repo.findById.mockResolvedValue(makeSupplier({ departmentId: "dept-1" }));
      await expect(service.get(ACTOR, "sup-1")).resolves.toBeDefined();
    });
  });

  it("maps a missing supplier on update to SUPPLIER_NOT_FOUND", async () => {
    grantOnly(["supplier.update", "ORGANIZATION"]);
    repo.update.mockResolvedValue("not_found");
    await expectCode(
      service.update(ACTOR, "sup-1", { name: "x" }),
      "SUPPLIER_NOT_FOUND",
    );
  });
});
