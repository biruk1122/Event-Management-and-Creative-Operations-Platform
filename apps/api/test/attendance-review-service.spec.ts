import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ATTENDANCE_ERROR } from "../src/attendance/attendance.errors.js";
import type {
  ExceptionRecord,
  OvertimeApprovalRecord,
} from "../src/attendance/review/infrastructure/review.repository.js";
import { AttendanceReviewService } from "../src/attendance/review/review.service.js";
import { SECURITY_ERROR } from "../src/common/security/security.errors.js";
import type { DepartmentAccessContext } from "../src/common/security/department-access.policy.js";

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

function makeOvertime(
  overrides: Partial<OvertimeApprovalRecord> = {},
): OvertimeApprovalRecord {
  return {
    id: "overtime-1",
    attendanceSessionId: "session-1",
    employeeId: "employee-1",
    employeeName: "Employee One",
    employeeDepartmentId: "dept-1",
    sessionDate: new Date("2026-11-01T00:00:00Z"),
    potentialMinutes: 90,
    requestedReason: null,
    status: "PENDING",
    approvedMinutes: null,
    decisionReason: null,
    decidedByName: null,
    decidedAt: null,
    createdAt: new Date("2026-11-01T02:00:00Z"),
    ...overrides,
  };
}

function makeException(
  overrides: Partial<ExceptionRecord> = {},
): ExceptionRecord {
  return {
    id: "exception-1",
    attendanceSessionId: "session-1",
    employeeId: "employee-1",
    employeeName: "Employee One",
    employeeDepartmentId: "dept-1",
    type: "OUT_OF_RANGE",
    description: "Recorded 500m away",
    requestedCheckInAt: null,
    requestedCheckOutAt: null,
    status: "PENDING",
    reviewNote: null,
    reviewedByName: null,
    reviewedAt: null,
    createdAt: new Date("2026-11-01T18:05:00Z"),
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

/** The default `resolveWorkingDays` fixture shared by most `summarize()`
 * tests below: 3 working days, none OFF/holiday (those are
 * `AttendanceRepository.resolveWorkingDays`'s own concern, covered against
 * real SQL in the persistence integration test, not re-tested here). */
const DEFAULT_WORKING_DAYS = new Map<string, "FULL" | "HALF">([
  ["2026-11-02", "FULL"],
  ["2026-11-03", "FULL"],
  ["2026-11-04", "HALF"],
]);

describe("AttendanceReviewService", () => {
  let repository: {
    findUserDepartmentId: ReturnType<typeof vi.fn>;
    findOvertimeById: ReturnType<typeof vi.fn>;
    listOvertime: ReturnType<typeof vi.fn>;
    decideOvertime: ReturnType<typeof vi.fn>;
    findExceptionById: ReturnType<typeof vi.fn>;
    listExceptions: ReturnType<typeof vi.fn>;
    decideException: ReturnType<typeof vi.fn>;
    summarize: ReturnType<typeof vi.fn>;
    listActiveEmployees: ReturnType<typeof vi.fn>;
    listPresentDates: ReturnType<typeof vi.fn>;
  };
  let permissions: {
    hasGrant: ReturnType<typeof vi.fn>;
    getAccessContext: ReturnType<typeof vi.fn>;
  };
  let audit: { record: ReturnType<typeof vi.fn> };
  let attendance: {
    listSessions: ReturnType<typeof vi.fn>;
    resolveWorkingDays: ReturnType<typeof vi.fn>;
    listWeekdaySchedule: ReturnType<typeof vi.fn>;
    createWeekdaySchedule: ReturnType<typeof vi.fn>;
    listHolidays: ReturnType<typeof vi.fn>;
    createHoliday: ReturnType<typeof vi.fn>;
    updateHoliday: ReturnType<typeof vi.fn>;
    removeHoliday: ReturnType<typeof vi.fn>;
  };
  let leave: { listApprovedInRange: ReturnType<typeof vi.fn> };
  let service: AttendanceReviewService;

  beforeEach(() => {
    repository = {
      findUserDepartmentId: vi.fn().mockResolvedValue("dept-1"),
      findOvertimeById: vi.fn().mockResolvedValue(makeOvertime()),
      listOvertime: vi.fn().mockResolvedValue([makeOvertime()]),
      decideOvertime: vi.fn().mockResolvedValue(makeOvertime({ status: "APPROVED" })),
      findExceptionById: vi.fn().mockResolvedValue(makeException()),
      listExceptions: vi.fn().mockResolvedValue([makeException()]),
      decideException: vi.fn().mockResolvedValue(makeException({ status: "APPROVED" })),
      summarize: vi.fn().mockResolvedValue([
        {
          employeeId: "employee-1",
          employeeName: "Employee One",
          sessionsCount: 5,
          actualMinutes: 2400,
          lateMinutes: 15,
          earlyDepartureMinutes: 0,
          potentialOvertimeMinutes: 60,
          approvedOvertimeMinutes: 30,
        },
      ]),
      listActiveEmployees: vi
        .fn()
        .mockResolvedValue([{ id: "employee-1", name: "Employee One" }]),
      listPresentDates: vi
        .fn()
        .mockResolvedValue(
          new Map([["employee-1", new Set(["2026-11-02", "2026-11-03"])]]),
        ),
    };
    permissions = {
      hasGrant: vi.fn().mockImplementation(
        (_userId: string, _key: string, scope: string): Promise<boolean> =>
          Promise.resolve(scope === "DEPARTMENT"),
      ),
      getAccessContext: vi.fn().mockResolvedValue(MARKETING_MANAGER_CONTEXT),
    };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    attendance = {
      listSessions: vi.fn().mockResolvedValue([]),
      resolveWorkingDays: vi.fn().mockResolvedValue(new Map(DEFAULT_WORKING_DAYS)),
      listWeekdaySchedule: vi.fn().mockResolvedValue([]),
      createWeekdaySchedule: vi.fn().mockResolvedValue({
        dayOfWeek: 6,
        type: "HALF",
        effectiveFrom: new Date("2026-11-01"),
      }),
      listHolidays: vi.fn().mockResolvedValue([]),
      createHoliday: vi.fn().mockResolvedValue({
        id: "holiday-1",
        date: new Date("2027-01-07"),
        name: "Christmas",
        createdByName: null,
        createdAt: new Date("2026-11-01"),
      }),
      updateHoliday: vi.fn().mockResolvedValue({
        id: "holiday-1",
        date: new Date("2027-01-07"),
        name: "Christmas (updated)",
        createdByName: null,
        createdAt: new Date("2026-11-01"),
      }),
      removeHoliday: vi.fn().mockResolvedValue(true),
    };
    leave = { listApprovedInRange: vi.fn().mockResolvedValue([]) };
    service = new AttendanceReviewService(
      repository as never,
      permissions as never,
      audit as never,
      attendance as never,
      leave as never,
    );
  });

  describe("overtime", () => {
    it("forbids approving your own overtime even with organization-wide access", async () => {
      permissions.hasGrant.mockResolvedValue(true);
      await expectCode(
        service.decideOvertime(
          "employee-1",
          "overtime-1",
          { decision: "APPROVED", approvedMinutes: 60 },
          "req-1",
        ),
        ATTENDANCE_ERROR.selfApprovalForbidden,
      );
      expect(repository.decideOvertime).not.toHaveBeenCalled();
    });

    it("denies a department manager from a different department", async () => {
      repository.findUserDepartmentId.mockResolvedValue("dept-OTHER");
      await expectCode(
        service.decideOvertime(
          "manager-1",
          "overtime-1",
          { decision: "APPROVED", approvedMinutes: 60 },
          "req-1",
        ),
        SECURITY_ERROR.permissionDenied,
      );
    });

    it("rejects deciding an overtime that was already decided", async () => {
      repository.findOvertimeById.mockResolvedValue(makeOvertime({ status: "APPROVED" }));
      await expectCode(
        service.decideOvertime(
          "manager-1",
          "overtime-1",
          { decision: "APPROVED", approvedMinutes: 60 },
          "req-1",
        ),
        ATTENDANCE_ERROR.overtimeAlreadyDecided,
      );
    });

    it("rejects an unknown overtime id", async () => {
      repository.findOvertimeById.mockResolvedValue(null);
      await expectCode(
        service.decideOvertime(
          "manager-1",
          "missing",
          { decision: "APPROVED", approvedMinutes: 60 },
          "req-1",
        ),
        ATTENDANCE_ERROR.overtimeNotFound,
      );
    });

    it("approves within the manager's own department, passing approvedMinutes through", async () => {
      await service.decideOvertime(
        "manager-1",
        "overtime-1",
        {
          decision: "APPROVED",
          approvedMinutes: 60,
          decisionReason: "Confirmed with event lead",
        },
        "req-1",
      );
      expect(repository.decideOvertime).toHaveBeenCalledWith(
        "overtime-1",
        expect.objectContaining({
          status: "APPROVED",
          approvedMinutes: 60,
          decisionReason: "Confirmed with event lead",
          decidedById: "manager-1",
        }),
      );
    });

    it("rejects without requiring approvedMinutes", async () => {
      await service.decideOvertime("manager-1", "overtime-1", { decision: "REJECTED" }, "req-1");
      expect(repository.decideOvertime).toHaveBeenCalledWith(
        "overtime-1",
        expect.objectContaining({ status: "REJECTED" }),
      );
      const call = repository.decideOvertime.mock.calls[0]![1] as Record<string, unknown>;
      expect(call.approvedMinutes).toBeUndefined();
    });

    it("scopes the overtime list to the manager's own department", async () => {
      await service.listOvertime("manager-1");
      expect(repository.listOvertime).toHaveBeenCalledWith(
        expect.objectContaining({ departmentId: "dept-1" }),
      );
    });

    it("lists organization-wide with no department filter for an org-scope grant", async () => {
      permissions.hasGrant.mockResolvedValue(true);
      await service.listOvertime("admin-1");
      const call = repository.listOvertime.mock.calls[0]![0] as Record<string, unknown>;
      expect(call.departmentId).toBeUndefined();
    });

    it("denies listing when the caller has no grant at all", async () => {
      permissions.hasGrant.mockResolvedValue(false);
      await expectCode(service.listOvertime("user-1"), SECURITY_ERROR.permissionDenied);
    });
  });

  describe("exceptions", () => {
    it("forbids reviewing your own flagged exception", async () => {
      permissions.hasGrant.mockResolvedValue(true);
      await expectCode(
        service.decideException("employee-1", "exception-1", { decision: "APPROVED" }, "req-1"),
        ATTENDANCE_ERROR.selfApprovalForbidden,
      );
      expect(repository.decideException).not.toHaveBeenCalled();
    });

    it("rejects deciding an exception that was already decided", async () => {
      repository.findExceptionById.mockResolvedValue(makeException({ status: "REJECTED" }));
      await expectCode(
        service.decideException("manager-1", "exception-1", { decision: "APPROVED" }, "req-1"),
        ATTENDANCE_ERROR.exceptionAlreadyDecided,
      );
    });

    it("rejects an unknown exception id", async () => {
      repository.findExceptionById.mockResolvedValue(null);
      await expectCode(
        service.decideException("manager-1", "missing", { decision: "APPROVED" }, "req-1"),
        ATTENDANCE_ERROR.exceptionNotFound,
      );
    });

    it("approves within the manager's own department", async () => {
      await service.decideException(
        "manager-1",
        "exception-1",
        { decision: "APPROVED", reviewNote: "Confirmed with security desk" },
        "req-1",
      );
      expect(repository.decideException).toHaveBeenCalledWith(
        "exception-1",
        expect.objectContaining({
          status: "APPROVED",
          reviewNote: "Confirmed with security desk",
          reviewedById: "manager-1",
        }),
      );
    });

    it("denies a department manager from a different department", async () => {
      repository.findUserDepartmentId.mockResolvedValue("dept-OTHER");
      await expectCode(
        service.decideException("manager-1", "exception-1", { decision: "REJECTED" }, "req-1"),
        SECURITY_ERROR.permissionDenied,
      );
    });
  });

  describe("summarize", () => {
    const START = new Date("2026-11-01");
    const END = new Date("2026-11-30");

    it("scopes every scoped query to the manager's own department", async () => {
      await service.summarize("manager-1", START, END);
      expect(repository.summarize).toHaveBeenCalledWith(
        expect.objectContaining({ departmentId: "dept-1" }),
      );
      expect(leave.listApprovedInRange).toHaveBeenCalledWith(
        expect.objectContaining({ departmentId: "dept-1" }),
      );
      expect(repository.listActiveEmployees).toHaveBeenCalledWith(
        expect.objectContaining({ departmentId: "dept-1" }),
      );
      expect(repository.listPresentDates).toHaveBeenCalledWith(
        expect.objectContaining({ departmentId: "dept-1" }),
      );
      // The weekly schedule/holiday calendar is organization-wide, not
      // department-scoped - only the start/end dates are passed.
      expect(attendance.resolveWorkingDays).toHaveBeenCalledWith(START, END);
    });

    it("applies no department filter for an organization-scope grant", async () => {
      permissions.hasGrant.mockResolvedValue(true);
      await service.summarize("admin-1", START, END);
      for (const mockFn of [
        repository.summarize,
        leave.listApprovedInRange,
        repository.listActiveEmployees,
        repository.listPresentDates,
      ]) {
        const call = mockFn.mock.calls[0]![0] as Record<string, unknown>;
        expect(call.departmentId).toBeUndefined();
      }
    });

    it("denies a caller with no grant at all", async () => {
      permissions.hasGrant.mockResolvedValue(false);
      await expectCode(
        service.summarize("user-1", START, END),
        SECURITY_ERROR.permissionDenied,
      );
    });

    it("classifies a roster employee's working days into Present/Absent and reconciles against Scheduled", async () => {
      // Fixture: 3 working days (2026-11-02 FULL, 03 FULL, 04 HALF), present
      // on the first two, nothing on the third, no approved leave.
      const result = await service.summarize("manager-1", START, END);
      expect(result).toEqual([
        expect.objectContaining({
          employeeId: "employee-1",
          scheduledDays: 3,
          presentDays: 2,
          absentDays: 1,
          onLeaveDays: 0,
        }),
      ]);
    });

    it("counts a day as On-leave rather than Present when both an approved leave and a session exist on it", async () => {
      // employee-1 has a session on 2026-11-02 (per the default
      // listPresentDates fixture) AND an approved leave covering that same
      // date - On-leave must win, matching the classification order.
      leave.listApprovedInRange.mockResolvedValue([
        {
          employeeId: "employee-1",
          employeeName: "Employee One",
          startDate: new Date("2026-11-02"),
          endDate: new Date("2026-11-02"),
        },
      ]);
      const result = await service.summarize("manager-1", START, END);
      expect(result).toEqual([
        expect.objectContaining({
          employeeId: "employee-1",
          scheduledDays: 3,
          onLeaveDays: 1, // 11-02, not counted as Present
          presentDays: 1, // only 11-03 remains
          absentDays: 1, // 11-04
        }),
      ]);
    });

    it("surfaces an active employee with zero sessions and zero leave as fully absent", async () => {
      repository.summarize.mockResolvedValue([]);
      repository.listActiveEmployees.mockResolvedValue([
        { id: "employee-3", name: "Employee Three" },
      ]);
      repository.listPresentDates.mockResolvedValue(new Map());
      const result = await service.summarize("manager-1", START, END);
      expect(result).toEqual([
        expect.objectContaining({
          employeeId: "employee-3",
          employeeName: "Employee Three",
          sessionsCount: 0,
          scheduledDays: 3,
          presentDays: 0,
          absentDays: 3,
          onLeaveDays: 0,
        }),
      ]);
    });

    it("surfaces a since-deactivated employee's approved leave even though they are no longer in the active roster", async () => {
      // employee-2 is NOT returned by listActiveEmployees (e.g. no longer
      // ACTIVE) but still has a real historical leave record in range - it
      // must not be silently dropped just because the roster moved on.
      leave.listApprovedInRange.mockResolvedValue([
        {
          employeeId: "employee-2",
          employeeName: "Employee Two",
          startDate: START,
          endDate: END,
        },
      ]);
      const result = await service.summarize("manager-1", START, END);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            employeeId: "employee-2",
            employeeName: "Employee Two",
            sessionsCount: 0,
            scheduledDays: 3,
            presentDays: 0,
            absentDays: 0,
            onLeaveDays: 3,
          }),
        ]),
      );
    });

    it("reconciles scheduledDays === presentDays + absentDays + onLeaveDays for every row, across a mixed roster", async () => {
      repository.listActiveEmployees.mockResolvedValue([
        { id: "employee-1", name: "Employee One" },
        { id: "employee-3", name: "Employee Three" },
      ]);
      repository.listPresentDates.mockResolvedValue(
        new Map([["employee-1", new Set(["2026-11-02"])]]),
      );
      leave.listApprovedInRange.mockResolvedValue([
        {
          employeeId: "employee-3",
          employeeName: "Employee Three",
          startDate: new Date("2026-11-04"),
          endDate: new Date("2026-11-04"),
        },
      ]);
      const result = await service.summarize("manager-1", START, END);
      expect(result.length).toBeGreaterThan(0);
      for (const row of result) {
        expect(row.scheduledDays).toBe(
          row.presentDays + row.absentDays + row.onLeaveDays,
        );
      }
    });
  });

  describe("calendar", () => {
    it("allows a Super Admin holding the organization-scope grant to list weekdays", async () => {
      permissions.getAccessContext.mockResolvedValue(SUPER_ADMIN_CONTEXT);
      permissions.hasGrant.mockResolvedValue(true);
      await service.listWeekdaySchedule("admin-1");
      expect(attendance.listWeekdaySchedule).toHaveBeenCalled();
    });

    it("allows the HR & Executive Officer department's own manager to list weekdays", async () => {
      permissions.getAccessContext.mockResolvedValue(HR_MANAGER_CONTEXT);
      permissions.hasGrant.mockResolvedValue(true);
      await service.listWeekdaySchedule("hr-manager-1");
      expect(attendance.listWeekdaySchedule).toHaveBeenCalled();
    });

    it("denies a non-HR department manager even though they hold the same department-scope grant", async () => {
      permissions.getAccessContext.mockResolvedValue(MARKETING_MANAGER_CONTEXT);
      permissions.hasGrant.mockResolvedValue(true);
      await expectCode(
        service.listWeekdaySchedule("marketing-manager-1"),
        SECURITY_ERROR.permissionDenied,
      );
      expect(attendance.listWeekdaySchedule).not.toHaveBeenCalled();
    });

    it("denies a department member regardless of grants", async () => {
      permissions.getAccessContext.mockResolvedValue(DEPARTMENT_MEMBER_CONTEXT);
      permissions.hasGrant.mockResolvedValue(true);
      await expectCode(
        service.listWeekdaySchedule("member-1"),
        SECURITY_ERROR.permissionDenied,
      );
    });

    it("denies a Super Admin missing the organization-scope grant", async () => {
      permissions.getAccessContext.mockResolvedValue(SUPER_ADMIN_CONTEXT);
      permissions.hasGrant.mockResolvedValue(false);
      await expectCode(
        service.listWeekdaySchedule("admin-1"),
        SECURITY_ERROR.permissionDenied,
      );
    });

    it("writes an audit record when creating a weekday schedule change", async () => {
      permissions.getAccessContext.mockResolvedValue(SUPER_ADMIN_CONTEXT);
      permissions.hasGrant.mockResolvedValue(true);
      await service.createWeekdaySchedule(
        "admin-1",
        { dayOfWeek: 6, type: "OFF", effectiveFrom: "2027-01-01" },
        "req-1",
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "attendance.calendar.weekday_updated" }),
      );
    });

    it("maps an already-effective weekday change to a clean conflict error", async () => {
      permissions.getAccessContext.mockResolvedValue(SUPER_ADMIN_CONTEXT);
      permissions.hasGrant.mockResolvedValue(true);
      attendance.createWeekdaySchedule.mockResolvedValue("already_effective");
      await expectCode(
        service.createWeekdaySchedule(
          "admin-1",
          { dayOfWeek: 6, type: "OFF", effectiveFrom: "2027-01-01" },
          "req-1",
        ),
        ATTENDANCE_ERROR.weekdayScheduleConflict,
      );
    });

    it("denies creating a weekday change for a non-HR department manager", async () => {
      permissions.getAccessContext.mockResolvedValue(MARKETING_MANAGER_CONTEXT);
      permissions.hasGrant.mockResolvedValue(true);
      await expectCode(
        service.createWeekdaySchedule(
          "marketing-manager-1",
          { dayOfWeek: 6, type: "OFF", effectiveFrom: "2027-01-01" },
          "req-1",
        ),
        SECURITY_ERROR.permissionDenied,
      );
      expect(attendance.createWeekdaySchedule).not.toHaveBeenCalled();
    });

    it("allows the HR manager to list and create holidays", async () => {
      permissions.getAccessContext.mockResolvedValue(HR_MANAGER_CONTEXT);
      permissions.hasGrant.mockResolvedValue(true);
      await service.listHolidays("hr-manager-1");
      await service.createHoliday(
        "hr-manager-1",
        { date: "2027-01-07", name: "Christmas" },
        "req-1",
      );
      expect(attendance.listHolidays).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "attendance.calendar.holiday_created" }),
      );
    });

    it("maps a duplicate holiday date to a clean conflict error on create", async () => {
      permissions.getAccessContext.mockResolvedValue(SUPER_ADMIN_CONTEXT);
      permissions.hasGrant.mockResolvedValue(true);
      attendance.createHoliday.mockResolvedValue("date_taken");
      await expectCode(
        service.createHoliday(
          "admin-1",
          { date: "2027-01-07", name: "Christmas" },
          "req-1",
        ),
        ATTENDANCE_ERROR.holidayDateTaken,
      );
    });

    it("maps a duplicate holiday date to a clean conflict error on update", async () => {
      permissions.getAccessContext.mockResolvedValue(SUPER_ADMIN_CONTEXT);
      permissions.hasGrant.mockResolvedValue(true);
      attendance.updateHoliday.mockResolvedValue("date_taken");
      await expectCode(
        service.updateHoliday("admin-1", "holiday-1", { date: "2027-01-07" }, "req-1"),
        ATTENDANCE_ERROR.holidayDateTaken,
      );
    });

    it("rejects editing an unknown holiday", async () => {
      permissions.getAccessContext.mockResolvedValue(SUPER_ADMIN_CONTEXT);
      permissions.hasGrant.mockResolvedValue(true);
      attendance.updateHoliday.mockResolvedValue("not_found");
      await expectCode(
        service.updateHoliday("admin-1", "missing", { name: "x" }, "req-1"),
        ATTENDANCE_ERROR.holidayNotFound,
      );
    });

    it("rejects removing an unknown holiday", async () => {
      permissions.getAccessContext.mockResolvedValue(SUPER_ADMIN_CONTEXT);
      permissions.hasGrant.mockResolvedValue(true);
      attendance.removeHoliday.mockResolvedValue(false);
      await expectCode(
        service.removeHoliday("admin-1", "missing", "req-1"),
        ATTENDANCE_ERROR.holidayNotFound,
      );
    });

    it("writes an audit record when removing a holiday", async () => {
      permissions.getAccessContext.mockResolvedValue(SUPER_ADMIN_CONTEXT);
      permissions.hasGrant.mockResolvedValue(true);
      await service.removeHoliday("admin-1", "holiday-1", "req-1");
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "attendance.calendar.holiday_removed" }),
      );
    });

    it("denies holiday management for a non-HR department manager", async () => {
      permissions.getAccessContext.mockResolvedValue(MARKETING_MANAGER_CONTEXT);
      permissions.hasGrant.mockResolvedValue(true);
      await expectCode(
        service.createHoliday(
          "marketing-manager-1",
          { date: "2027-01-07", name: "Christmas" },
          "req-1",
        ),
        SECURITY_ERROR.permissionDenied,
      );
      expect(attendance.createHoliday).not.toHaveBeenCalled();
    });
  });

  describe("listDetailedSessions", () => {
    const START = new Date("2026-11-01");
    const END = new Date("2026-11-30");

    it("allows a Super Admin holding the organization-scope grant", async () => {
      permissions.getAccessContext.mockResolvedValue(SUPER_ADMIN_CONTEXT);
      permissions.hasGrant.mockResolvedValue(true);
      await service.listDetailedSessions("admin-1", START, END);
      expect(attendance.listSessions).toHaveBeenCalledWith({
        startDate: START,
        endDate: END,
      });
    });

    it("denies a Super Admin missing the organization-scope grant", async () => {
      permissions.getAccessContext.mockResolvedValue(SUPER_ADMIN_CONTEXT);
      permissions.hasGrant.mockResolvedValue(false);
      await expectCode(
        service.listDetailedSessions("admin-1", START, END),
        SECURITY_ERROR.permissionDenied,
      );
    });

    it("allows the HR & Executive Officer department's own manager", async () => {
      permissions.getAccessContext.mockResolvedValue(HR_MANAGER_CONTEXT);
      permissions.hasGrant.mockResolvedValue(true);
      await service.listDetailedSessions("hr-manager-1", START, END, "employee-9");
      expect(attendance.listSessions).toHaveBeenCalledWith({
        startDate: START,
        endDate: END,
        employeeId: "employee-9",
      });
    });

    it("denies a non-HR department manager even though they hold the same department-scope grant", async () => {
      permissions.getAccessContext.mockResolvedValue(MARKETING_MANAGER_CONTEXT);
      permissions.hasGrant.mockResolvedValue(true);
      await expectCode(
        service.listDetailedSessions("marketing-manager-1", START, END),
        SECURITY_ERROR.permissionDenied,
      );
      expect(attendance.listSessions).not.toHaveBeenCalled();
    });

    it("denies a department member regardless of grants", async () => {
      permissions.getAccessContext.mockResolvedValue(DEPARTMENT_MEMBER_CONTEXT);
      permissions.hasGrant.mockResolvedValue(true);
      await expectCode(
        service.listDetailedSessions("member-1", START, END),
        SECURITY_ERROR.permissionDenied,
      );
    });
  });
});
