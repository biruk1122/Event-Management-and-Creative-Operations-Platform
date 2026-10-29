import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EmployeeRecord } from "../src/employees/infrastructure/employees.repository.js";
import { EmployeesService } from "../src/employees/employees.service.js";
import type { DepartmentAccessContext } from "../src/common/security/department-access.policy.js";

const ACTOR = "actor-1";

function makeEmployee(overrides: Partial<EmployeeRecord> = {}): EmployeeRecord {
  return {
    id: "emp-1",
    userId: "user-1",
    employeeCode: "EMP-0001",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    personalPhone: null,
    companyPhone: null,
    gender: null,
    dateOfBirth: null,
    city: null,
    subCity: null,
    woreda: null,
    bankAccountNumber: null,
    departmentId: "dept-marketing",
    departmentName: "Marketing",
    position: "Coordinator",
    employmentType: "FULL_TIME",
    employmentDate: new Date("2026-01-01T00:00:00Z"),
    employmentStatus: "ACTIVE",
    workLocation: null,
    reportingManagerId: null,
    reportingManagerName: null,
    grade: null,
    description: null,
    baseSalary: null,
    salaryScale: null,
    allowanceAmount: null,
    currency: null,
    totalCompensation: null,
    userStatus: "ACTIVE",
    userRoleName: "Department Member",
    statusChangedAt: null,
    statusChangedById: null,
    createdById: "hr-manager-1",
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

describe("EmployeesService", () => {
  let repository: {
    findById: ReturnType<typeof vi.fn>;
    findByUserId: ReturnType<typeof vi.fn>;
    userExists: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    createForExistingUser: ReturnType<typeof vi.fn>;
    createForNewUser: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    setStatus: ReturnType<typeof vi.fn>;
  };
  let permissions: {
    getAccessContext: ReturnType<typeof vi.fn>;
    hasGrant: ReturnType<typeof vi.fn>;
  };
  let passwordHasher: { hash: ReturnType<typeof vi.fn> };
  let db: {
    role: { findUnique: ReturnType<typeof vi.fn> };
    department: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let service: EmployeesService;

  beforeEach(() => {
    repository = {
      findById: vi.fn(),
      findByUserId: vi.fn(),
      userExists: vi.fn(),
      list: vi.fn(),
      createForExistingUser: vi.fn(),
      createForNewUser: vi.fn(),
      update: vi.fn(),
      setStatus: vi.fn(),
    };
    permissions = {
      getAccessContext: vi.fn().mockResolvedValue(SUPER_ADMIN_CONTEXT),
      hasGrant: vi.fn().mockResolvedValue(true),
    };
    passwordHasher = { hash: vi.fn().mockResolvedValue("argon2id$hash") };
    db = {
      role: {
        findUnique: vi.fn().mockResolvedValue({
          id: "role-member",
          name: "Department Member",
          isSystem: true,
        }),
      },
      department: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ name: "Marketing", deactivatedAt: null }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    service = new EmployeesService(
      repository as never,
      permissions as never,
      passwordHasher as never,
      db as never,
    );
  });

  describe("access boundary", () => {
    it("allows a Super Admin holding employee.read at organization scope", async () => {
      repository.list.mockResolvedValue({ items: [], total: 0 });
      await expect(
        service.list(ACTOR, {
          sort: "name",
          direction: "asc",
          page: 1,
          pageSize: 25,
        }),
      ).resolves.toMatchObject({ total: 0 });
    });

    it("denies a Super Admin who somehow lacks the organization grant", async () => {
      permissions.hasGrant.mockResolvedValueOnce(false);
      await expectCode(
        service.list(ACTOR, {
          sort: "name",
          direction: "asc",
          page: 1,
          pageSize: 25,
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
          sort: "name",
          direction: "asc",
          page: 1,
          pageSize: 25,
        }),
      ).resolves.toMatchObject({ total: 0 });
    });

    it("denies a Department Manager of any other department, even holding the grant", async () => {
      permissions.getAccessContext.mockResolvedValue(MARKETING_MANAGER_CONTEXT);
      await expectCode(
        service.list(ACTOR, {
          sort: "name",
          direction: "asc",
          page: 1,
          pageSize: 25,
        }),
        "PERMISSION_DENIED",
      );
      expect(repository.list).not.toHaveBeenCalled();
    });

    it("denies a plain Department Member in the HR department", async () => {
      permissions.getAccessContext.mockResolvedValue(DEPARTMENT_MEMBER_CONTEXT);
      await expectCode(
        service.list(ACTOR, {
          sort: "name",
          direction: "asc",
          page: 1,
          pageSize: 25,
        }),
        "PERMISSION_DENIED",
      );
      expect(repository.list).not.toHaveBeenCalled();
    });

    it("denies an HR manager whose department has been deactivated", async () => {
      permissions.getAccessContext.mockResolvedValue({
        role: "DEPARTMENT_MANAGER",
        department: {
          id: "dept-hr",
          name: "HR & Executive Officer",
          active: false,
        },
      });
      await expectCode(
        service.list(ACTOR, {
          sort: "name",
          direction: "asc",
          page: 1,
          pageSize: 25,
        }),
        "PERMISSION_DENIED",
      );
    });

    it("denies a caller with no role assignment at all", async () => {
      permissions.getAccessContext.mockResolvedValue({
        role: null,
        department: null,
      });
      await expectCode(
        service.list(ACTOR, {
          sort: "name",
          direction: "asc",
          page: 1,
          pageSize: 25,
        }),
        "PERMISSION_DENIED",
      );
    });

    it("applies the same boundary to get/register/update/updateStatus", async () => {
      permissions.getAccessContext.mockResolvedValue(MARKETING_MANAGER_CONTEXT);
      await expectCode(service.get(ACTOR, "emp-1"), "PERMISSION_DENIED");
      await expectCode(
        service.register(ACTOR, {
          userId: "user-1",
          employeeCode: "EMP-0002",
          position: "Coordinator",
          employmentType: "FULL_TIME",
          employmentDate: "2026-01-01",
        }),
        "PERMISSION_DENIED",
      );
      await expectCode(
        service.update(ACTOR, "emp-1", { position: "Lead" }),
        "PERMISSION_DENIED",
      );
      await expectCode(
        service.updateStatus(ACTOR, "emp-1", { status: "INACTIVE" }),
        "PERMISSION_DENIED",
      );
      expect(repository.findById).not.toHaveBeenCalled();
      expect(repository.createForExistingUser).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.setStatus).not.toHaveBeenCalled();
    });
  });

  describe("register", () => {
    it("links an existing user and rejects a second profile for the same user", async () => {
      repository.findByUserId.mockResolvedValue(makeEmployee());
      await expectCode(
        service.register(ACTOR, {
          userId: "user-1",
          employeeCode: "EMP-0002",
          position: "Coordinator",
          employmentType: "FULL_TIME",
          employmentDate: "2026-01-01",
        }),
        "EMPLOYEE_USER_ALREADY_LINKED",
      );
      expect(repository.createForExistingUser).not.toHaveBeenCalled();
    });

    it("rejects creating a new account without all required fields", async () => {
      await expectCode(
        service.register(ACTOR, {
          employeeCode: "EMP-0002",
          position: "Coordinator",
          employmentType: "FULL_TIME",
          employmentDate: "2026-01-01",
        }),
        "EMPLOYEE_ASSIGNMENT_INVALID",
      );
      expect(repository.createForNewUser).not.toHaveBeenCalled();
    });

    it("rejects assigning a Super Admin role when creating a new account", async () => {
      db.role.findUnique.mockResolvedValue({
        id: "role-admin",
        name: "Super Admin",
        isSystem: true,
      });
      await expectCode(
        service.register(ACTOR, {
          email: "new@example.com",
          firstName: "New",
          lastName: "Hire",
          temporaryPassword: "password123",
          roleId: "role-admin",
          departmentId: "dept-marketing",
          employeeCode: "EMP-0002",
          position: "Coordinator",
          employmentType: "FULL_TIME",
          employmentDate: "2026-01-01",
        }),
        "EMPLOYEE_ASSIGNMENT_INVALID",
      );
      expect(repository.createForNewUser).not.toHaveBeenCalled();
    });

    it("rejects a base salary without a currency", async () => {
      await expectCode(
        service.register(ACTOR, {
          userId: "user-1",
          employeeCode: "EMP-0002",
          position: "Coordinator",
          employmentType: "FULL_TIME",
          employmentDate: "2026-01-01",
          baseSalary: 25000,
        }),
        "EMPLOYEE_ASSIGNMENT_INVALID",
      );
      expect(repository.createForExistingUser).not.toHaveBeenCalled();
    });

    it("creates a new account on the happy path, hashing the password", async () => {
      repository.createForNewUser.mockResolvedValue(makeEmployee());
      await service.register(ACTOR, {
        email: "new@example.com",
        firstName: "New",
        lastName: "Hire",
        temporaryPassword: "password123",
        roleId: "role-member",
        departmentId: "dept-marketing",
        employeeCode: "EMP-0002",
        position: "Coordinator",
        employmentType: "FULL_TIME",
        employmentDate: "2026-01-01",
      });
      expect(passwordHasher.hash).toHaveBeenCalledWith("password123");
      expect(repository.createForNewUser).toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("rejects an employee being set as their own reporting manager", async () => {
      repository.findById.mockResolvedValue(makeEmployee());
      await expectCode(
        service.update(ACTOR, "emp-1", { reportingManagerId: "emp-1" }),
        "EMPLOYEE_ASSIGNMENT_INVALID",
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it("rejects clearing currency while an amount is still recorded", async () => {
      repository.findById.mockResolvedValue(
        makeEmployee({ baseSalary: "25000.00", currency: "ETB" }),
      );
      await expectCode(
        service.update(ACTOR, "emp-1", { currency: null }),
        "EMPLOYEE_ASSIGNMENT_INVALID",
      );
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe("updateStatus", () => {
    it("rejects a no-op transition to the current status", async () => {
      repository.findById.mockResolvedValue(
        makeEmployee({ employmentStatus: "ACTIVE" }),
      );
      await expectCode(
        service.updateStatus(ACTOR, "emp-1", { status: "ACTIVE" }),
        "EMPLOYEE_ALREADY_IN_STATUS",
      );
      expect(repository.setStatus).not.toHaveBeenCalled();
    });

    it("protects the Super Admin account from deactivation", async () => {
      repository.findById.mockResolvedValue(
        makeEmployee({
          employmentStatus: "ACTIVE",
          userRoleName: "Super Admin",
        }),
      );
      await expectCode(
        service.updateStatus(ACTOR, "emp-1", { status: "INACTIVE" }),
        "EMPLOYEE_ASSIGNMENT_INVALID",
      );
      expect(repository.setStatus).not.toHaveBeenCalled();
    });

    it("sets status on the happy path", async () => {
      repository.findById.mockResolvedValue(
        makeEmployee({ employmentStatus: "ACTIVE" }),
      );
      repository.setStatus.mockResolvedValue(
        makeEmployee({ employmentStatus: "ON_LEAVE" }),
      );
      await service.updateStatus(ACTOR, "emp-1", { status: "ON_LEAVE" });
      expect(repository.setStatus).toHaveBeenCalledWith(
        "emp-1",
        "ON_LEAVE",
        ACTOR,
      );
    });
  });
});
