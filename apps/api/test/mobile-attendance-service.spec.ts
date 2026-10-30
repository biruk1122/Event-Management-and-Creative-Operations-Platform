import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ATTENDANCE_ERROR } from "../src/attendance/attendance.errors.js";
import type { AttendanceSessionRecord } from "../src/attendance/infrastructure/attendance.repository.js";
import type { ShiftGeofenceRecord } from "../src/attendance/mobile/infrastructure/mobile-attendance.repository.js";
import { MobileAttendanceService } from "../src/attendance/mobile/mobile-attendance.service.js";
import {
  AttendanceMethod,
  AttendanceSessionStatus,
  AttendanceVerificationResult,
  EventShiftStatus,
  PunchType,
} from "../src/generated/prisma/client.js";

function makeSession(
  overrides: Partial<AttendanceSessionRecord> = {},
): AttendanceSessionRecord {
  return {
    id: "session-1",
    employeeId: "employee-1",
    employeeName: "Employee One",
    method: AttendanceMethod.MOBILE_EVENT,
    kioskId: null,
    kioskName: null,
    eventShiftId: "shift-1",
    eventName: "Launch Night",
    sessionDate: new Date("2026-01-01T00:00:00Z"),
    checkInAt: new Date("2026-01-01T18:00:00Z"),
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

function makeShift(
  overrides: Partial<ShiftGeofenceRecord> = {},
): ShiftGeofenceRecord {
  return {
    id: "shift-1",
    eventName: "Launch Night",
    status: EventShiftStatus.CONFIRMED,
    plannedStartAt: new Date("2026-01-01T18:00:00Z"),
    plannedEndAt: new Date("2026-01-02T02:00:00Z"),
    latitude: 9.03,
    longitude: 38.74,
    geofenceRadiusMeters: 150,
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

describe("MobileAttendanceService", () => {
  let mobile: {
    findAssignedShifts: ReturnType<typeof vi.fn>;
    hasActiveAssignment: ReturnType<typeof vi.fn>;
    findShiftGeofence: ReturnType<typeof vi.fn>;
    createLocationException: ReturnType<typeof vi.fn>;
  };
  let attendance: {
    findOpenSession: ReturnType<typeof vi.fn>;
    checkIn: ReturnType<typeof vi.fn>;
    checkOut: ReturnType<typeof vi.fn>;
    listSessionsForEmployee: ReturnType<typeof vi.fn>;
  };
  let audit: { record: ReturnType<typeof vi.fn> };
  let leave: { hasApprovedLeaveOverlap: ReturnType<typeof vi.fn> };
  let service: MobileAttendanceService;

  beforeEach(() => {
    mobile = {
      findAssignedShifts: vi.fn().mockResolvedValue([]),
      hasActiveAssignment: vi.fn().mockResolvedValue(true),
      findShiftGeofence: vi.fn().mockResolvedValue(makeShift()),
      createLocationException: vi.fn().mockResolvedValue(undefined),
    };
    attendance = {
      findOpenSession: vi.fn().mockResolvedValue(null),
      checkIn: vi.fn().mockResolvedValue(makeSession()),
      checkOut: vi.fn().mockResolvedValue(
        makeSession({
          status: AttendanceSessionStatus.CLOSED,
          checkOutAt: new Date("2026-01-02T02:00:00Z"),
        }),
      ),
      listSessionsForEmployee: vi.fn().mockResolvedValue([makeSession()]),
    };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    leave = { hasApprovedLeaveOverlap: vi.fn().mockResolvedValue(false) };
    service = new MobileAttendanceService(
      mobile as never,
      attendance as never,
      audit as never,
      leave as never,
    );
  });

  describe("checkIn", () => {
    const base = {
      punchType: PunchType.CHECK_IN,
      eventShiftId: "shift-1",
      clientRequestId: "r-1",
      latitude: 9.03,
      longitude: 38.74,
      accuracyMeters: 10,
    };

    it("rejects a shift that does not exist", async () => {
      mobile.findShiftGeofence.mockResolvedValue(null);
      await expectCode(
        service.punch("employee-1", base, "req-1"),
        ATTENDANCE_ERROR.shiftNotFound,
      );
    });

    it("rejects a cancelled shift", async () => {
      mobile.findShiftGeofence.mockResolvedValue(
        makeShift({ status: EventShiftStatus.CANCELLED }),
      );
      await expectCode(
        service.punch("employee-1", base, "req-1"),
        ATTENDANCE_ERROR.shiftNotAvailable,
      );
    });

    it("rejects a completed shift", async () => {
      mobile.findShiftGeofence.mockResolvedValue(
        makeShift({ status: EventShiftStatus.COMPLETED }),
      );
      await expectCode(
        service.punch("employee-1", base, "req-1"),
        ATTENDANCE_ERROR.shiftNotAvailable,
      );
    });

    it("rejects an employee with no active assignment to the shift", async () => {
      mobile.hasActiveAssignment.mockResolvedValue(false);
      await expectCode(
        service.punch("employee-1", base, "req-1"),
        ATTENDANCE_ERROR.notAssignedToShift,
      );
      expect(attendance.checkIn).not.toHaveBeenCalled();
    });

    it("rejects a check-in against a shift the employee has approved leave covering", async () => {
      leave.hasApprovedLeaveOverlap.mockResolvedValue(true);
      await expectCode(
        service.punch("employee-1", base, "req-1"),
        ATTENDANCE_ERROR.leaveConflict,
      );
      expect(attendance.checkIn).not.toHaveBeenCalled();
    });

    it("records a VERIFIED check-in inside the geofence and raises no exception", async () => {
      const result = await service.punch("employee-1", base, "req-1");
      expect(result.verificationResult).toBe(
        AttendanceVerificationResult.VERIFIED,
      );
      expect(attendance.checkIn).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: "employee-1",
          method: AttendanceMethod.MOBILE_EVENT,
          eventShiftId: "shift-1",
          verificationResult: AttendanceVerificationResult.VERIFIED,
        }),
      );
      expect(mobile.createLocationException).not.toHaveBeenCalled();
    });

    it("flags an out-of-range check-in for manager review", async () => {
      const farAway = { ...base, latitude: 10.5, longitude: 40.5 };
      const result = await service.punch("employee-1", farAway, "req-1");
      expect(result.verificationResult).toBe(
        AttendanceVerificationResult.OUT_OF_RANGE,
      );
      expect(mobile.createLocationException).toHaveBeenCalledWith(
        expect.objectContaining({ type: "OUT_OF_RANGE" }),
      );
    });

    it("flags a check-in with no device location for manager review", async () => {
      const noLocation = {
        punchType: PunchType.CHECK_IN,
        eventShiftId: "shift-1",
        clientRequestId: "r-1",
      };
      const result = await service.punch("employee-1", noLocation, "req-1");
      expect(result.verificationResult).toBe(
        AttendanceVerificationResult.LOCATION_UNAVAILABLE,
      );
      expect(mobile.createLocationException).toHaveBeenCalledWith(
        expect.objectContaining({ type: "LOCATION_UNAVAILABLE" }),
      );
    });

    it("records LOW_ACCURACY within range but raises no review exception", async () => {
      const lowAccuracy = { ...base, accuracyMeters: 500 };
      const result = await service.punch("employee-1", lowAccuracy, "req-1");
      expect(result.verificationResult).toBe(
        AttendanceVerificationResult.LOW_ACCURACY,
      );
      expect(mobile.createLocationException).not.toHaveBeenCalled();
    });

    it("rejects a duplicate check-in with a conflict", async () => {
      attendance.checkIn.mockResolvedValue("already_checked_in");
      await expectCode(
        service.punch("employee-1", base, "req-1"),
        ATTENDANCE_ERROR.alreadyCheckedIn,
      );
      expect(mobile.createLocationException).not.toHaveBeenCalled();
    });
  });

  describe("checkOut", () => {
    const base = {
      punchType: PunchType.CHECK_OUT,
      clientRequestId: "r-2",
      latitude: 9.03,
      longitude: 38.74,
      accuracyMeters: 10,
    };

    it("rejects a check-out with no open session", async () => {
      attendance.findOpenSession.mockResolvedValue(null);
      await expectCode(
        service.punch("employee-1", base, "req-1"),
        ATTENDANCE_ERROR.noOpenSession,
      );
    });

    it("geofences against the open session's own shift, not a client-supplied id", async () => {
      attendance.findOpenSession.mockResolvedValue(makeSession());
      const result = await service.punch("employee-1", base, "req-1");
      expect(mobile.findShiftGeofence).toHaveBeenCalledWith("shift-1");
      expect(result.verificationResult).toBe(
        AttendanceVerificationResult.VERIFIED,
      );
    });

    it("treats a kiosk-opened open session (no eventShiftId) as not applicable", async () => {
      attendance.findOpenSession.mockResolvedValue(
        makeSession({
          method: AttendanceMethod.OFFICE_KIOSK,
          eventShiftId: null,
        }),
      );
      const result = await service.punch("employee-1", base, "req-1");
      expect(mobile.findShiftGeofence).not.toHaveBeenCalled();
      expect(result.verificationResult).toBe(
        AttendanceVerificationResult.NOT_APPLICABLE,
      );
      expect(attendance.checkOut).toHaveBeenCalledWith(
        expect.objectContaining({
          verificationResult: AttendanceVerificationResult.NOT_APPLICABLE,
        }),
      );
    });

    it("never leaves NOT_APPLICABLE on a MOBILE_EVENT check-out whose shift is no longer resolvable", async () => {
      attendance.findOpenSession.mockResolvedValue(makeSession());
      mobile.findShiftGeofence.mockResolvedValue(null);
      const result = await service.punch("employee-1", base, "req-1");
      expect(result.verificationResult).toBe(
        AttendanceVerificationResult.LOCATION_UNAVAILABLE,
      );
      expect(attendance.checkOut).toHaveBeenCalledWith(
        expect.objectContaining({
          verificationResult: AttendanceVerificationResult.LOCATION_UNAVAILABLE,
        }),
      );
      expect(mobile.createLocationException).toHaveBeenCalledWith(
        expect.objectContaining({ type: "LOCATION_UNAVAILABLE" }),
      );
    });

    it("flags an out-of-range check-out for manager review", async () => {
      attendance.findOpenSession.mockResolvedValue(makeSession());
      const farAway = { ...base, latitude: 10.5, longitude: 40.5 };
      const result = await service.punch("employee-1", farAway, "req-1");
      expect(result.verificationResult).toBe(
        AttendanceVerificationResult.OUT_OF_RANGE,
      );
      expect(mobile.createLocationException).toHaveBeenCalledWith(
        expect.objectContaining({ type: "OUT_OF_RANGE" }),
      );
    });

    it("rejects a race where the session closed between lookup and checkout", async () => {
      attendance.findOpenSession.mockResolvedValue(makeSession());
      attendance.checkOut.mockResolvedValue("no_open_session");
      await expectCode(
        service.punch("employee-1", base, "req-1"),
        ATTENDANCE_ERROR.noOpenSession,
      );
    });
  });

  describe("mySessions", () => {
    it("returns the employee's own recent sessions, mapped to the response shape", async () => {
      const result = await service.mySessions("employee-1");
      expect(attendance.listSessionsForEmployee).toHaveBeenCalledWith(
        "employee-1",
        25,
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("session-1");
    });
  });

  describe("myShifts", () => {
    it("maps assigned shift records to the response shape", async () => {
      mobile.findAssignedShifts.mockResolvedValue([
        {
          id: "shift-1",
          eventName: "Launch Night",
          label: "Evening",
          plannedStartAt: new Date("2026-01-01T18:00:00Z"),
          plannedEndAt: new Date("2026-01-02T02:00:00Z"),
          timeZone: "Africa/Addis_Ababa",
          locationLabel: "Main Stage",
          status: EventShiftStatus.CONFIRMED,
        },
      ]);
      const result = await service.myShifts("employee-1");
      expect(result).toEqual([
        {
          id: "shift-1",
          eventName: "Launch Night",
          label: "Evening",
          plannedStartAt: "2026-01-01T18:00:00.000Z",
          plannedEndAt: "2026-01-02T02:00:00.000Z",
          timeZone: "Africa/Addis_Ababa",
          locationLabel: "Main Stage",
          status: "CONFIRMED",
        },
      ]);
    });
  });
});
