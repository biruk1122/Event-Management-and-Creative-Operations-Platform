import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ATTENDANCE_ERROR } from "../src/attendance/attendance.errors.js";
import { SECURITY_ERROR } from "../src/common/security/security.errors.js";
import type {
  GrantRecord,
  LeaveRequestRecord,
} from "../src/leave/infrastructure/leave.repository.js";
import { LEAVE_ERROR } from "../src/leave/leave.errors.js";
import { LeaveService } from "../src/leave/leave.service.js";

function makeGrantRecord(overrides: Partial<GrantRecord> = {}): GrantRecord {
  return {
    id: "grant-1",
    employeeId: "employee-1",
    leaveTypeId: "type-1",
    leaveTypeName: "Annual",
    grantedDays: 10,
    remaining: 10,
    grantedAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: new Date("2028-01-01T00:00:00Z"),
    note: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeRequestRecord(
  overrides: Partial<LeaveRequestRecord> = {},
): LeaveRequestRecord {
  return {
    id: "request-1",
    employeeId: "employee-1",
    employeeName: "Employee One",
    employeeDepartmentId: "dept-1",
    leaveTypeId: "type-1",
    leaveTypeName: "Annual",
    startDate: new Date("2026-12-24T00:00:00Z"),
    endDate: new Date("2026-12-26T00:00:00Z"),
    daysRequested: 3,
    reason: "Holiday",
    status: "PENDING",
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: new Date("2026-11-01T00:00:00Z"),
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

describe("LeaveService", () => {
  let repository: {
    findUserDepartmentId: ReturnType<typeof vi.fn>;
    isActiveEmployee: ReturnType<typeof vi.fn>;
    findLeaveTypeContext: ReturnType<typeof vi.fn>;
    createGrant: ReturnType<typeof vi.fn>;
    listGrants: ReturnType<typeof vi.fn>;
    computeBalance: ReturnType<typeof vi.fn>;
    consumeForRequest: ReturnType<typeof vi.fn>;
    hasOverlappingRequest: ReturnType<typeof vi.fn>;
    createRequest: ReturnType<typeof vi.fn>;
    findRequestById: ReturnType<typeof vi.fn>;
    listRequests: ReturnType<typeof vi.fn>;
    decideRequest: ReturnType<typeof vi.fn>;
    withdrawRequest: ReturnType<typeof vi.fn>;
    listApprovedInRange: ReturnType<typeof vi.fn>;
  };
  let permissions: { hasGrant: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };
  let service: LeaveService;

  beforeEach(() => {
    repository = {
      findUserDepartmentId: vi.fn().mockResolvedValue("dept-1"),
      isActiveEmployee: vi.fn().mockResolvedValue(true),
      findLeaveTypeContext: vi
        .fn()
        .mockResolvedValue({ id: "type-1", name: "Annual", isActive: true }),
      createGrant: vi.fn().mockResolvedValue(makeGrantRecord()),
      listGrants: vi.fn().mockResolvedValue([makeGrantRecord()]),
      computeBalance: vi.fn().mockResolvedValue({
        totalRemaining: 10,
        grants: [
          {
            grantId: "grant-1",
            remaining: 10,
            expiresAt: new Date("2028-01-01"),
          },
        ],
      }),
      consumeForRequest: vi.fn().mockResolvedValue("consumed"),
      hasOverlappingRequest: vi.fn().mockResolvedValue(false),
      createRequest: vi.fn().mockResolvedValue(makeRequestRecord()),
      findRequestById: vi.fn().mockResolvedValue(makeRequestRecord()),
      listRequests: vi.fn().mockResolvedValue([makeRequestRecord()]),
      decideRequest: vi
        .fn()
        .mockResolvedValue(makeRequestRecord({ status: "APPROVED" })),
      withdrawRequest: vi
        .fn()
        .mockResolvedValue(makeRequestRecord({ status: "WITHDRAWN" })),
      listApprovedInRange: vi.fn().mockResolvedValue([]),
    };
    permissions = {
      hasGrant: vi
        .fn()
        .mockImplementation(
          (_u: string, _k: string, scope: string): Promise<boolean> =>
            Promise.resolve(scope === "DEPARTMENT"),
        ),
    };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    service = new LeaveService(
      repository as never,
      permissions as never,
      audit as never,
    );
  });

  describe("grant", () => {
    it("rejects granting to an inactive employee", async () => {
      repository.isActiveEmployee.mockResolvedValue(false);
      await expectCode(
        service.grant(
          "manager-1",
          { employeeId: "employee-1", leaveTypeId: "type-1", grantedDays: 5 },
          "req-1",
        ),
        ATTENDANCE_ERROR.employeeNotFound,
      );
      expect(repository.createGrant).not.toHaveBeenCalled();
    });

    it("denies a manager from a different department", async () => {
      repository.findUserDepartmentId
        .mockResolvedValueOnce("dept-1") // the employee's own department
        .mockResolvedValueOnce("dept-OTHER"); // the acting manager's department
      await expectCode(
        service.grant(
          "manager-1",
          { employeeId: "employee-1", leaveTypeId: "type-1", grantedDays: 5 },
          "req-1",
        ),
        SECURITY_ERROR.permissionDenied,
      );
    });

    it("rejects an inactive leave type", async () => {
      repository.findLeaveTypeContext.mockResolvedValue({
        id: "type-1",
        name: "Annual",
        isActive: false,
      });
      await expectCode(
        service.grant(
          "manager-1",
          { employeeId: "employee-1", leaveTypeId: "type-1", grantedDays: 5 },
          "req-1",
        ),
        LEAVE_ERROR.typeInactive,
      );
    });

    it("grants with an expiry exactly two years after the grant date", async () => {
      await service.grant(
        "manager-1",
        { employeeId: "employee-1", leaveTypeId: "type-1", grantedDays: 5 },
        "req-1",
      );
      const call = repository.createGrant.mock.calls[0]![0] as {
        grantedAt: Date;
        expiresAt: Date;
      };
      expect(
        call.expiresAt.getUTCFullYear() - call.grantedAt.getUTCFullYear(),
      ).toBe(2);
    });
  });

  describe("createRequest", () => {
    const dto = {
      leaveTypeId: "type-1",
      startDate: "2026-12-24",
      endDate: "2026-12-26",
    };

    it("rejects an end date before the start date", async () => {
      await expectCode(
        service.createRequest(
          "employee-1",
          { ...dto, endDate: "2026-12-20" },
          "req-1",
        ),
        LEAVE_ERROR.invalidDateRange,
      );
    });

    it("rejects an overlapping request", async () => {
      repository.hasOverlappingRequest.mockResolvedValue(true);
      await expectCode(
        service.createRequest("employee-1", dto, "req-1"),
        LEAVE_ERROR.overlap,
      );
      expect(repository.createRequest).not.toHaveBeenCalled();
    });

    it("rejects insufficient balance", async () => {
      repository.computeBalance.mockResolvedValue({
        totalRemaining: 1,
        grants: [],
      });
      await expectCode(
        service.createRequest("employee-1", dto, "req-1"),
        LEAVE_ERROR.insufficientBalance,
      );
    });

    it("computes daysRequested inclusively and submits the request", async () => {
      await service.createRequest("employee-1", dto, "req-1");
      expect(repository.createRequest).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: "employee-1", daysRequested: 3 }),
      );
    });

    it("rejects a request against an inactive leave type", async () => {
      repository.findLeaveTypeContext.mockResolvedValue({
        id: "type-1",
        name: "Annual",
        isActive: false,
      });
      await expectCode(
        service.createRequest("employee-1", dto, "req-1"),
        LEAVE_ERROR.typeInactive,
      );
    });
  });

  describe("withdrawRequest", () => {
    it("rejects withdrawing someone else's request", async () => {
      await expectCode(
        service.withdrawRequest("someone-else", "request-1", "req-1"),
        SECURITY_ERROR.permissionDenied,
      );
    });

    it("rejects withdrawing an already-decided request", async () => {
      repository.findRequestById.mockResolvedValue(
        makeRequestRecord({ status: "APPROVED" }),
      );
      await expectCode(
        service.withdrawRequest("employee-1", "request-1", "req-1"),
        LEAVE_ERROR.requestNotWithdrawable,
      );
    });

    it("withdraws your own pending request", async () => {
      const result = await service.withdrawRequest(
        "employee-1",
        "request-1",
        "req-1",
      );
      expect(result.status).toBe("WITHDRAWN");
    });
  });

  describe("decideRequest", () => {
    it("forbids approving your own leave request", async () => {
      permissions.hasGrant.mockResolvedValue(true);
      await expectCode(
        service.decideRequest(
          "employee-1",
          "request-1",
          { decision: "APPROVED" },
          "req-1",
        ),
        ATTENDANCE_ERROR.selfApprovalForbidden,
      );
      expect(repository.consumeForRequest).not.toHaveBeenCalled();
    });

    it("denies a manager from a different department", async () => {
      repository.findUserDepartmentId.mockResolvedValue("dept-OTHER");
      await expectCode(
        service.decideRequest(
          "manager-1",
          "request-1",
          { decision: "APPROVED" },
          "req-1",
        ),
        SECURITY_ERROR.permissionDenied,
      );
    });

    it("rejects deciding an already-decided request", async () => {
      repository.findRequestById.mockResolvedValue(
        makeRequestRecord({ status: "APPROVED" }),
      );
      await expectCode(
        service.decideRequest(
          "manager-1",
          "request-1",
          { decision: "APPROVED" },
          "req-1",
        ),
        LEAVE_ERROR.requestAlreadyDecided,
      );
    });

    it("consumes balance via FIFO on approval", async () => {
      await service.decideRequest(
        "manager-1",
        "request-1",
        { decision: "APPROVED" },
        "req-1",
      );
      expect(repository.consumeForRequest).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: "employee-1", daysToConsume: 3 }),
      );
    });

    it("surfaces insufficient balance discovered at approval time", async () => {
      repository.consumeForRequest.mockResolvedValue("insufficient_balance");
      await expectCode(
        service.decideRequest(
          "manager-1",
          "request-1",
          { decision: "APPROVED" },
          "req-1",
        ),
        LEAVE_ERROR.insufficientBalance,
      );
    });

    it("never consumes balance on rejection", async () => {
      await service.decideRequest(
        "manager-1",
        "request-1",
        { decision: "REJECTED" },
        "req-1",
      );
      expect(repository.consumeForRequest).not.toHaveBeenCalled();
    });

    it("never consumes balance when returned for changes", async () => {
      await service.decideRequest(
        "manager-1",
        "request-1",
        { decision: "RETURNED_FOR_CHANGES" },
        "req-1",
      );
      expect(repository.consumeForRequest).not.toHaveBeenCalled();
      expect(repository.decideRequest).toHaveBeenCalledWith(
        "request-1",
        expect.objectContaining({ status: "RETURNED_FOR_CHANGES" }),
      );
    });
  });

  describe("listRequests visibility", () => {
    it("falls back to self-only when the caller has no review grant at all", async () => {
      permissions.hasGrant.mockResolvedValue(false);
      await service.listRequests("employee-1", {});
      expect(repository.listRequests).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: "employee-1" }),
      );
    });

    it("scopes to the manager's own department with a department-scope grant", async () => {
      await service.listRequests("manager-1", {});
      expect(repository.listRequests).toHaveBeenCalledWith(
        expect.objectContaining({ departmentId: "dept-1" }),
      );
    });

    it("applies no department filter for an organization-scope grant", async () => {
      permissions.hasGrant.mockResolvedValue(true);
      await service.listRequests("admin-1", {});
      const call = repository.listRequests.mock.calls[0]![0] as Record<
        string,
        unknown
      >;
      expect(call.departmentId).toBeUndefined();
    });
  });

  describe("calendar visibility", () => {
    it("restricts to the caller's own approved leave with no review grant", async () => {
      permissions.hasGrant.mockResolvedValue(false);
      await service.calendar(
        "employee-1",
        new Date("2026-12-01"),
        new Date("2026-12-31"),
      );
      expect(repository.listApprovedInRange).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: "employee-1" }),
      );
    });

    it("shows the whole organization for an organization-scope grant", async () => {
      permissions.hasGrant.mockResolvedValue(true);
      await service.calendar(
        "admin-1",
        new Date("2026-12-01"),
        new Date("2026-12-31"),
      );
      const call = repository.listApprovedInRange.mock.calls[0]![0] as Record<
        string,
        unknown
      >;
      expect(call.departmentId).toBeUndefined();
      expect(call.employeeId).toBeUndefined();
    });
  });
});
