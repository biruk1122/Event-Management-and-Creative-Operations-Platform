import { HttpException } from "@nestjs/common";
import type { Request } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_ERROR } from "../src/auth/auth.errors.js";
import type { AccountRecord } from "../src/auth/infrastructure/auth.repository.js";
import { ATTENDANCE_ERROR } from "../src/attendance/attendance.errors.js";
import type { AttendanceSessionRecord } from "../src/attendance/infrastructure/attendance.repository.js";
import { KioskSessionService } from "../src/attendance/kiosk/kiosk-session.service.js";
import {
  AttendanceMethod,
  AttendanceSessionStatus,
} from "../src/generated/prisma/client.js";

const request = { ip: "203.0.113.7", get: () => "vitest" } as unknown as Request;

function makeAccount(overrides: Partial<AccountRecord> = {}): AccountRecord {
  return {
    userId: "employee-1",
    email: "employee@e2e.test",
    status: "ACTIVE",
    credentialId: "cred-1",
    passwordHash: "$argon2id$stored",
    failedAttemptCount: 0,
    lockedUntil: null,
    ...overrides,
  };
}

function makeSession(
  overrides: Partial<AttendanceSessionRecord> = {},
): AttendanceSessionRecord {
  return {
    id: "session-1",
    employeeId: "employee-1",
    employeeName: "Employee One",
    method: AttendanceMethod.OFFICE_KIOSK,
    kioskId: "kiosk-1",
    kioskName: "Front Desk",
    eventShiftId: null,
    eventName: null,
    sessionDate: new Date("2026-01-01T00:00:00Z"),
    checkInAt: new Date("2026-01-01T09:00:00Z"),
    checkOutAt: null,
    status: AttendanceSessionStatus.OPEN,
    scheduledMinutes: null,
    actualMinutes: null,
    breakMinutes: 0,
    netMinutes: null,
    lateMinutes: 0,
    earlyDepartureMinutes: 0,
    potentialOvertimeMinutes: 0,
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

describe("KioskSessionService", () => {
  let kiosks: {
    isActiveEmployee: ReturnType<typeof vi.fn>;
    getEmployeeName: ReturnType<typeof vi.fn>;
    searchEmployees: ReturnType<typeof vi.fn>;
  };
  let authRepository: { findAccountByUserId: ReturnType<typeof vi.fn> };
  let authService: { verifyAccountPassword: ReturnType<typeof vi.fn> };
  let attendance: {
    findOpenSession: ReturnType<typeof vi.fn>;
    checkIn: ReturnType<typeof vi.fn>;
    checkOut: ReturnType<typeof vi.fn>;
  };
  let sessionTokens: { issue: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };
  let service: KioskSessionService;

  beforeEach(() => {
    kiosks = {
      isActiveEmployee: vi.fn().mockResolvedValue(true),
      getEmployeeName: vi.fn().mockResolvedValue("Employee One"),
      searchEmployees: vi.fn().mockResolvedValue([]),
    };
    authRepository = {
      findAccountByUserId: vi.fn().mockResolvedValue(makeAccount()),
    };
    authService = { verifyAccountPassword: vi.fn().mockResolvedValue(undefined) };
    attendance = {
      findOpenSession: vi.fn().mockResolvedValue(null),
      checkIn: vi.fn().mockResolvedValue(makeSession()),
      checkOut: vi.fn().mockResolvedValue(
        makeSession({
          status: AttendanceSessionStatus.CLOSED,
          checkOutAt: new Date("2026-01-01T17:00:00Z"),
        }),
      ),
    };
    sessionTokens = {
      issue: vi.fn().mockResolvedValue("session-token"),
      verify: vi.fn().mockResolvedValue({
        employeeId: "employee-1",
        kioskId: "kiosk-1",
      }),
    };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    service = new KioskSessionService(
      kiosks as never,
      authRepository as never,
      authService as never,
      attendance as never,
      sessionTokens as never,
      audit as never,
    );
  });

  describe("searchEmployees", () => {
    it("trims and forwards the search term with a bounded limit", async () => {
      await service.searchEmployees("  ana  ");
      expect(kiosks.searchEmployees).toHaveBeenCalledWith("ana", 20);
    });

    it("passes undefined through when no search term is supplied", async () => {
      await service.searchEmployees(undefined);
      expect(kiosks.searchEmployees).toHaveBeenCalledWith(undefined, 20);
    });
  });

  describe("verify", () => {
    it("issues a session token after a matching password, without ever returning it", async () => {
      const result = await service.verify(request, "kiosk-1", {
        employeeId: "employee-1",
        password: "correct-password",
      });
      expect(result.sessionToken).toBe("session-token");
      expect(result.employeeName).toBe("Employee One");
      expect(result.hasOpenSession).toBe(false);
      expect(sessionTokens.issue).toHaveBeenCalledWith({
        employeeId: "employee-1",
        kioskId: "kiosk-1",
      });
    });

    it("reports hasOpenSession true when the employee already has an open session", async () => {
      attendance.findOpenSession.mockResolvedValue(makeSession());
      const result = await service.verify(request, "kiosk-1", {
        employeeId: "employee-1",
        password: "correct-password",
      });
      expect(result.hasOpenSession).toBe(true);
    });

    it("rejects an employee id that is not an active employee before touching auth", async () => {
      kiosks.isActiveEmployee.mockResolvedValue(false);
      await expectCode(
        service.verify(request, "kiosk-1", {
          employeeId: "employee-1",
          password: "x",
        }),
        ATTENDANCE_ERROR.employeeNotFound,
      );
      expect(authService.verifyAccountPassword).not.toHaveBeenCalled();
    });

    it("propagates invalid-credentials from the shared account verification path", async () => {
      authService.verifyAccountPassword.mockRejectedValue(
        new HttpException(
          { code: AUTH_ERROR.invalidCredentials, error: "Bad Request" },
          400,
        ),
      );
      await expectCode(
        service.verify(request, "kiosk-1", {
          employeeId: "employee-1",
          password: "wrong",
        }),
        AUTH_ERROR.invalidCredentials,
      );
      expect(sessionTokens.issue).not.toHaveBeenCalled();
    });

    it("propagates a locked-account rejection without issuing a session token", async () => {
      authService.verifyAccountPassword.mockRejectedValue(
        new HttpException({ code: AUTH_ERROR.accountLocked, error: "Conflict" }, 409),
      );
      await expectCode(
        service.verify(request, "kiosk-1", {
          employeeId: "employee-1",
          password: "x",
        }),
        AUTH_ERROR.accountLocked,
      );
      expect(sessionTokens.issue).not.toHaveBeenCalled();
    });

    it("propagates an inactive-account rejection without issuing a session token", async () => {
      authService.verifyAccountPassword.mockRejectedValue(
        new HttpException({ code: AUTH_ERROR.accountInactive, error: "Conflict" }, 409),
      );
      await expectCode(
        service.verify(request, "kiosk-1", {
          employeeId: "employee-1",
          password: "x",
        }),
        AUTH_ERROR.accountInactive,
      );
      expect(sessionTokens.issue).not.toHaveBeenCalled();
    });

    it("looks up the account by the selected employee's user id", async () => {
      await service.verify(request, "kiosk-1", {
        employeeId: "employee-1",
        password: "correct-password",
      });
      expect(authRepository.findAccountByUserId).toHaveBeenCalledWith(
        "employee-1",
      );
    });
  });

  describe("punch", () => {
    it("rejects a missing or expired session token before touching attendance", async () => {
      sessionTokens.verify.mockResolvedValue(null);
      await expectCode(
        service.punch(
          "kiosk-1",
          { sessionToken: "stale", punchType: "CHECK_IN", clientRequestId: "r-1" },
          "req-1",
        ),
        ATTENDANCE_ERROR.kioskSessionExpired,
      );
      expect(attendance.checkIn).not.toHaveBeenCalled();
    });

    it("rejects a session token issued for a different kiosk", async () => {
      sessionTokens.verify.mockResolvedValue({
        employeeId: "employee-1",
        kioskId: "kiosk-OTHER",
      });
      await expectCode(
        service.punch(
          "kiosk-1",
          { sessionToken: "t", punchType: "CHECK_IN", clientRequestId: "r-1" },
          "req-1",
        ),
        ATTENDANCE_ERROR.kioskSessionExpired,
      );
      expect(attendance.checkIn).not.toHaveBeenCalled();
    });

    it("checks in via the shared attendance repository and records an audit entry", async () => {
      const result = await service.punch(
        "kiosk-1",
        { sessionToken: "t", punchType: "CHECK_IN", clientRequestId: "r-1" },
        "req-1",
      );
      expect(result.punchType).toBe("CHECK_IN");
      expect(attendance.checkIn).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: "employee-1",
          method: AttendanceMethod.OFFICE_KIOSK,
          kioskId: "kiosk-1",
          clientRequestId: "r-1",
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "attendance.checked_in" }),
      );
    });

    it("rejects a duplicate check-in with a conflict, not a second session", async () => {
      attendance.checkIn.mockResolvedValue("already_checked_in");
      await expectCode(
        service.punch(
          "kiosk-1",
          { sessionToken: "t", punchType: "CHECK_IN", clientRequestId: "r-1" },
          "req-1",
        ),
        ATTENDANCE_ERROR.alreadyCheckedIn,
      );
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("checks out via the shared attendance repository and records an audit entry", async () => {
      const result = await service.punch(
        "kiosk-1",
        { sessionToken: "t", punchType: "CHECK_OUT", clientRequestId: "r-2" },
        "req-1",
      );
      expect(result.punchType).toBe("CHECK_OUT");
      expect(attendance.checkOut).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: "employee-1", clientRequestId: "r-2" }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "attendance.checked_out" }),
      );
    });

    it("rejects a check-out with no open session", async () => {
      attendance.checkOut.mockResolvedValue("no_open_session");
      await expectCode(
        service.punch(
          "kiosk-1",
          { sessionToken: "t", punchType: "CHECK_OUT", clientRequestId: "r-2" },
          "req-1",
        ),
        ATTENDANCE_ERROR.noOpenSession,
      );
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});
