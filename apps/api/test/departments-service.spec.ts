import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DepartmentsService } from "../src/departments/departments.service.js";
import { DepartmentActivityFilter } from "../src/departments/dto/list-departments-query.dto.js";
import type { DepartmentRecord } from "../src/departments/infrastructure/departments.repository.js";
import type { PermissionScope } from "../src/generated/prisma/client.js";

const ACTOR = "actor-1";

function makeDepartment(
  overrides: Partial<DepartmentRecord> = {},
): DepartmentRecord {
  return {
    id: "dep-1",
    name: "Event Management",
    description: "Owns events.",
    manager: null,
    employeeCount: 0,
    deactivatedAt: null,
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

describe("DepartmentsService", () => {
  let repository: {
    list: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findUserDepartmentId: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    setManager: ReturnType<typeof vi.fn>;
    setDeactivated: ReturnType<typeof vi.fn>;
    deleteIfEmpty: ReturnType<typeof vi.fn>;
    assignEmployee: ReturnType<typeof vi.fn>;
    removeEmployee: ReturnType<typeof vi.fn>;
  };
  let permissions: {
    hasGrant: ReturnType<
      typeof vi.fn<
        (u: string, k: string, s: PermissionScope) => Promise<boolean>
      >
    >;
  };
  let service: DepartmentsService;

  beforeEach(() => {
    repository = {
      list: vi.fn(),
      findById: vi.fn(),
      findUserDepartmentId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      setManager: vi.fn(),
      setDeactivated: vi.fn(),
      deleteIfEmpty: vi.fn(),
      assignEmployee: vi.fn(),
      removeEmployee: vi.fn(),
    };
    permissions = { hasGrant: vi.fn().mockResolvedValue(true) };
    service = new DepartmentsService(repository as never, permissions as never);
  });

  function grantOnly(...allowed: [string, PermissionScope][]): void {
    permissions.hasGrant.mockImplementation((_userId, key, scope) =>
      Promise.resolve(allowed.some(([k, s]) => k === key && s === scope)),
    );
  }

  describe("read authorization and scope", () => {
    it("denies list and get without any department.read grant", async () => {
      grantOnly();
      await expectCode(
        service.list(ACTOR, { page: 1, pageSize: 25 }),
        "PERMISSION_DENIED",
      );
      await expectCode(service.get(ACTOR, "dep-1"), "PERMISSION_DENIED");
    });

    it("lists every department for an organization-scoped reader", async () => {
      grantOnly(["department.read", "ORGANIZATION"]);
      repository.list.mockResolvedValue({ items: [], total: 0 });

      await service.list(ACTOR, { page: 1, pageSize: 25 });

      expect(repository.list.mock.calls[0]?.[0]).not.toHaveProperty("ids");
    });

    it("restricts a department-scoped reader's list to their own department", async () => {
      grantOnly(["department.read", "DEPARTMENT"]);
      repository.findUserDepartmentId.mockResolvedValue("dep-9");
      repository.list.mockResolvedValue({ items: [], total: 0 });

      await service.list(ACTOR, { page: 1, pageSize: 25 });

      expect(repository.list).toHaveBeenCalledWith(
        expect.objectContaining({ ids: ["dep-9"] }),
      );
    });

    it("returns an empty page for a department-scoped reader with no department", async () => {
      grantOnly(["department.read", "DEPARTMENT"]);
      repository.findUserDepartmentId.mockResolvedValue(null);
      repository.list.mockResolvedValue({ items: [], total: 0 });

      await service.list(ACTOR, { page: 1, pageSize: 25 });

      expect(repository.list).toHaveBeenCalledWith(
        expect.objectContaining({ ids: [] }),
      );
    });

    it("lets a department-scoped reader open only their own department", async () => {
      grantOnly(["department.read", "DEPARTMENT"]);
      repository.findUserDepartmentId.mockResolvedValue("dep-1");
      repository.findById.mockResolvedValue(makeDepartment());

      await expect(service.get(ACTOR, "dep-1")).resolves.toMatchObject({
        id: "dep-1",
      });
      await expectCode(service.get(ACTOR, "dep-2"), "PERMISSION_DENIED");
    });

    it("maps the status filter and translates a missing department to 404", async () => {
      grantOnly(["department.read", "ORGANIZATION"]);
      repository.findById.mockResolvedValue(null);
      await expectCode(service.get(ACTOR, "ghost"), "DEPARTMENT_NOT_FOUND");
    });

    it("forwards the trimmed search term and status filter to the repository", async () => {
      grantOnly(["department.read", "ORGANIZATION"]);
      repository.list.mockResolvedValue({ items: [], total: 0 });

      await service.list(ACTOR, {
        page: 2,
        pageSize: 10,
        search: "  events  ",
        status: DepartmentActivityFilter.INACTIVE,
      });

      expect(repository.list).toHaveBeenCalledWith(
        expect.objectContaining({
          search: "events",
          active: false,
          page: 2,
          pageSize: 10,
        }),
      );
    });

    it("denies a department-scoped reader who has no department of their own", async () => {
      grantOnly(["department.read", "DEPARTMENT"]);
      repository.findUserDepartmentId.mockResolvedValue(null);
      await expectCode(service.get(ACTOR, "dep-1"), "PERMISSION_DENIED");
    });
  });

  describe("create", () => {
    it("requires department.create and trims the payload", async () => {
      const created = makeDepartment();
      repository.create.mockResolvedValue(created);

      await service.create(ACTOR, {
        name: "  Event Management  ",
        description: "  Owns events.  ",
        managerId: "user-7",
      });

      expect(permissions.hasGrant).toHaveBeenCalledWith(
        ACTOR,
        "department.create",
        "ORGANIZATION",
      );
      expect(repository.create).toHaveBeenCalledWith({
        name: "Event Management",
        description: "Owns events.",
        managerId: "user-7",
      });
    });

    it("rejects without the grant", async () => {
      grantOnly();
      await expectCode(
        service.create(ACTOR, { name: "X" }),
        "PERMISSION_DENIED",
      );
    });

    it("maps a name conflict and a missing manager", async () => {
      repository.create.mockResolvedValueOnce("name_conflict");
      await expectCode(
        service.create(ACTOR, { name: "Dup" }),
        "DEPARTMENT_NAME_CONFLICT",
      );

      repository.create.mockResolvedValueOnce("manager_not_found");
      await expectCode(
        service.create(ACTOR, { name: "New", managerId: "ghost" }),
        "USER_NOT_FOUND",
      );
    });
  });

  describe("update", () => {
    it("sends only the provided fields and requires department.update", async () => {
      repository.update.mockResolvedValue(makeDepartment());

      await service.update(ACTOR, "dep-1", { description: "  New  " });

      expect(permissions.hasGrant).toHaveBeenCalledWith(
        ACTOR,
        "department.update",
        "ORGANIZATION",
      );
      expect(repository.update).toHaveBeenCalledWith("dep-1", {
        description: "New",
      });
    });

    it("maps not-found and name conflict", async () => {
      repository.update.mockResolvedValueOnce("not_found");
      await expectCode(
        service.update(ACTOR, "dep-1", { name: "A" }),
        "DEPARTMENT_NOT_FOUND",
      );
      repository.update.mockResolvedValueOnce("name_conflict");
      await expectCode(
        service.update(ACTOR, "dep-1", { name: "A" }),
        "DEPARTMENT_NAME_CONFLICT",
      );
    });
  });

  describe("manager assignment", () => {
    it("sets and clears the manager under department.assign_manager", async () => {
      repository.setManager.mockResolvedValue(makeDepartment());

      await service.setManager(ACTOR, "dep-1", "user-3");
      await service.setManager(ACTOR, "dep-1", null);

      expect(permissions.hasGrant).toHaveBeenCalledWith(
        ACTOR,
        "department.assign_manager",
        "ORGANIZATION",
      );
      expect(repository.setManager).toHaveBeenNthCalledWith(
        1,
        "dep-1",
        "user-3",
      );
      expect(repository.setManager).toHaveBeenNthCalledWith(2, "dep-1", null);
    });

    it("maps a missing department and a missing manager user", async () => {
      repository.setManager.mockResolvedValueOnce("not_found");
      await expectCode(
        service.setManager(ACTOR, "dep-1", "user-3"),
        "DEPARTMENT_NOT_FOUND",
      );
      repository.setManager.mockResolvedValueOnce("manager_not_found");
      await expectCode(
        service.setManager(ACTOR, "dep-1", "ghost"),
        "USER_NOT_FOUND",
      );
    });
  });

  describe("deactivate and reactivate", () => {
    it("deactivates an active department", async () => {
      repository.findById.mockResolvedValue(makeDepartment());
      repository.setDeactivated.mockResolvedValue(
        makeDepartment({ deactivatedAt: new Date("2026-02-01T00:00:00.000Z") }),
      );

      const result = await service.deactivate(ACTOR, "dep-1");

      expect(permissions.hasGrant).toHaveBeenCalledWith(
        ACTOR,
        "department.update",
        "ORGANIZATION",
      );
      expect(repository.setDeactivated).toHaveBeenCalledWith(
        "dep-1",
        expect.any(Date),
      );
      expect(result.deactivatedAt).toBe("2026-02-01T00:00:00.000Z");
    });

    it("rejects deactivating one that is already inactive", async () => {
      repository.findById.mockResolvedValue(
        makeDepartment({ deactivatedAt: new Date() }),
      );
      await expectCode(
        service.deactivate(ACTOR, "dep-1"),
        "DEPARTMENT_ALREADY_INACTIVE",
      );
      expect(repository.setDeactivated).not.toHaveBeenCalled();
    });

    it("reactivates an inactive department and rejects an active one", async () => {
      repository.findById.mockResolvedValueOnce(
        makeDepartment({ deactivatedAt: new Date() }),
      );
      repository.setDeactivated.mockResolvedValue(makeDepartment());
      await expect(service.reactivate(ACTOR, "dep-1")).resolves.toMatchObject({
        deactivatedAt: null,
      });

      repository.findById.mockResolvedValueOnce(makeDepartment());
      await expectCode(
        service.reactivate(ACTOR, "dep-1"),
        "DEPARTMENT_ALREADY_ACTIVE",
      );
    });

    it("404s a deactivate for a missing department", async () => {
      repository.findById.mockResolvedValue(null);
      await expectCode(
        service.deactivate(ACTOR, "ghost"),
        "DEPARTMENT_NOT_FOUND",
      );
    });
  });

  describe("remove", () => {
    it("removes an empty department under department.delete", async () => {
      repository.deleteIfEmpty.mockResolvedValue("deleted");
      await expect(service.remove(ACTOR, "dep-1")).resolves.toBeUndefined();
      expect(permissions.hasGrant).toHaveBeenCalledWith(
        ACTOR,
        "department.delete",
        "ORGANIZATION",
      );
    });

    it("maps not-found and in-use", async () => {
      repository.deleteIfEmpty.mockResolvedValueOnce("not_found");
      await expectCode(service.remove(ACTOR, "dep-1"), "DEPARTMENT_NOT_FOUND");
      repository.deleteIfEmpty.mockResolvedValueOnce("in_use");
      await expectCode(service.remove(ACTOR, "dep-1"), "DEPARTMENT_IN_USE");
    });
  });

  describe("employee membership", () => {
    it("assigns and removes members under user.assign_department", async () => {
      repository.assignEmployee.mockResolvedValue(
        makeDepartment({ employeeCount: 1 }),
      );
      repository.removeEmployee.mockResolvedValue(
        makeDepartment({ employeeCount: 0 }),
      );

      await expect(
        service.assignEmployee(ACTOR, "dep-1", "user-2"),
      ).resolves.toMatchObject({ employeeCount: 1 });
      await expect(
        service.removeEmployee(ACTOR, "dep-1", "user-2"),
      ).resolves.toMatchObject({ employeeCount: 0 });

      expect(permissions.hasGrant).toHaveBeenCalledWith(
        ACTOR,
        "user.assign_department",
        "ORGANIZATION",
      );
    });

    it("maps missing department, missing user, and non-membership", async () => {
      repository.assignEmployee.mockResolvedValueOnce("department_not_found");
      await expectCode(
        service.assignEmployee(ACTOR, "dep-1", "user-2"),
        "DEPARTMENT_NOT_FOUND",
      );
      repository.assignEmployee.mockResolvedValueOnce("user_not_found");
      await expectCode(
        service.assignEmployee(ACTOR, "dep-1", "ghost"),
        "USER_NOT_FOUND",
      );
      repository.removeEmployee.mockResolvedValueOnce("not_a_member");
      await expectCode(
        service.removeEmployee(ACTOR, "dep-1", "user-2"),
        "USER_NOT_IN_DEPARTMENT",
      );
    });
  });

  it("maps a persistence record to the public shape", async () => {
    grantOnly(["department.read", "ORGANIZATION"]);
    repository.findById.mockResolvedValue(
      makeDepartment({
        manager: {
          id: "user-9",
          email: "m@example.com",
          firstName: "Morgan",
          lastName: null,
        },
        employeeCount: 4,
      }),
    );

    const result = await service.get(ACTOR, "dep-1");

    expect(result).toEqual({
      id: "dep-1",
      name: "Event Management",
      description: "Owns events.",
      manager: {
        id: "user-9",
        email: "m@example.com",
        firstName: "Morgan",
        lastName: null,
      },
      employeeCount: 4,
      deactivatedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });
});
