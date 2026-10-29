import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LEAVE_ERROR } from "../src/leave/leave.errors.js";
import { LeaveTypesService } from "../src/leave/leave-types.service.js";
import type { LeaveTypeRecord } from "../src/leave/infrastructure/leave-types.repository.js";
import { SECURITY_ERROR } from "../src/common/security/security.errors.js";

function makeType(overrides: Partial<LeaveTypeRecord> = {}): LeaveTypeRecord {
  return {
    id: "type-1",
    name: "Annual",
    description: null,
    isPaid: true,
    requiresDocumentation: false,
    requiresApproval: true,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
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

describe("LeaveTypesService", () => {
  let repository: {
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let permissions: { hasGrant: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };
  let service: LeaveTypesService;

  beforeEach(() => {
    repository = {
      create: vi.fn().mockResolvedValue(makeType()),
      findById: vi.fn().mockResolvedValue(makeType()),
      list: vi.fn().mockResolvedValue([makeType()]),
      update: vi.fn().mockResolvedValue(makeType({ isActive: false })),
    };
    permissions = { hasGrant: vi.fn().mockResolvedValue(true) };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    service = new LeaveTypesService(repository as never, permissions as never, audit as never);
  });

  it("denies creating a leave type without organization-scope access", async () => {
    permissions.hasGrant.mockResolvedValue(false);
    await expectCode(
      service.create("user-1", { name: "Annual" }, "req-1"),
      SECURITY_ERROR.permissionDenied,
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("surfaces a taken name as a conflict", async () => {
    repository.create.mockResolvedValue("name_taken");
    await expectCode(
      service.create("admin-1", { name: "Annual" }, "req-1"),
      LEAVE_ERROR.typeNameTaken,
    );
  });

  it("lists active-only types without requiring any permission", async () => {
    permissions.hasGrant.mockResolvedValue(false);
    const result = await service.list("user-1", false);
    expect(result).toHaveLength(1);
    expect(repository.list).toHaveBeenCalledWith(false);
  });

  it("denies listing inactive types without organization-scope access", async () => {
    permissions.hasGrant.mockResolvedValue(false);
    await expectCode(service.list("user-1", true), SECURITY_ERROR.permissionDenied);
  });

  it("rejects updating an unknown leave type", async () => {
    repository.findById.mockResolvedValue(null);
    await expectCode(
      service.update("admin-1", "missing", { isActive: false }, "req-1"),
      LEAVE_ERROR.typeNotFound,
    );
  });

  it("updates an existing leave type", async () => {
    const result = await service.update("admin-1", "type-1", { isActive: false }, "req-1");
    expect(result.isActive).toBe(false);
  });
});
