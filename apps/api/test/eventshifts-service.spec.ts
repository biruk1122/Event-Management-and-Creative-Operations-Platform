import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ATTENDANCE_ERROR } from "../src/attendance/attendance.errors.js";
import { EventShiftsService } from "../src/attendance/scheduling/eventshifts.service.js";
import type { EventShiftRecord } from "../src/attendance/scheduling/infrastructure/eventshifts.repository.js";
import { SECURITY_ERROR } from "../src/common/security/security.errors.js";
import { EventShiftStatus } from "../src/generated/prisma/client.js";

function makeShift(overrides: Partial<EventShiftRecord> = {}): EventShiftRecord {
  return {
    id: "shift-1",
    eventId: "event-1",
    eventName: "Launch Night",
    eventDepartmentId: "dept-1",
    label: "Evening",
    plannedStartAt: new Date("2026-11-01T18:00:00Z"),
    plannedEndAt: new Date("2026-11-02T02:00:00Z"),
    timeZone: "Africa/Addis_Ababa",
    locationLabel: "Main Stage",
    latitude: 9.03,
    longitude: 38.74,
    geofenceRadiusMeters: 150,
    breakMinutes: 30,
    status: EventShiftStatus.PLANNED,
    createdAt: new Date("2026-10-01T00:00:00Z"),
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

describe("EventShiftsService", () => {
  let repository: {
    findUserDepartmentId: ReturnType<typeof vi.fn>;
    findEventContext: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    listByEvent: ReturnType<typeof vi.fn>;
    updateMetadata: ReturnType<typeof vi.fn>;
    reschedule: ReturnType<typeof vi.fn>;
    setStatus: ReturnType<typeof vi.fn>;
    listChanges: ReturnType<typeof vi.fn>;
    assign: ReturnType<typeof vi.fn>;
    unassign: ReturnType<typeof vi.fn>;
    listAssignments: ReturnType<typeof vi.fn>;
    isActiveEmployee: ReturnType<typeof vi.fn>;
  };
  let permissions: { hasGrant: ReturnType<typeof vi.fn> };
  let leave: { hasApprovedLeaveOverlap: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };
  let service: EventShiftsService;

  beforeEach(() => {
    repository = {
      findUserDepartmentId: vi.fn().mockResolvedValue("dept-1"),
      findEventContext: vi
        .fn()
        .mockResolvedValue({ id: "event-1", name: "Launch Night", departmentId: "dept-1" }),
      create: vi.fn().mockResolvedValue(makeShift()),
      findById: vi.fn().mockResolvedValue(makeShift()),
      listByEvent: vi.fn().mockResolvedValue([makeShift()]),
      updateMetadata: vi.fn().mockResolvedValue(makeShift()),
      reschedule: vi.fn().mockResolvedValue(makeShift()),
      setStatus: vi.fn().mockResolvedValue(makeShift({ status: EventShiftStatus.CANCELLED })),
      listChanges: vi.fn().mockResolvedValue([]),
      assign: vi.fn().mockResolvedValue(undefined),
      unassign: vi.fn().mockResolvedValue("unassigned"),
      listAssignments: vi.fn().mockResolvedValue([]),
      isActiveEmployee: vi.fn().mockResolvedValue(true),
    };
    permissions = {
      hasGrant: vi.fn().mockImplementation((_userId: string, _key: string, scope: string) =>
        Promise.resolve(scope === "DEPARTMENT"),
      ),
    };
    leave = { hasApprovedLeaveOverlap: vi.fn().mockResolvedValue(false) };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    service = new EventShiftsService(
      repository as never,
      permissions as never,
      leave as never,
      audit as never,
    );
  });

  describe("authorization", () => {
    it("allows an ORGANIZATION-scope grant regardless of department", async () => {
      permissions.hasGrant.mockResolvedValue(true);
      repository.findUserDepartmentId.mockResolvedValue(null);
      await expect(service.list("user-1", "event-1")).resolves.toBeDefined();
    });

    it("allows a DEPARTMENT-scope manager whose own department matches the event's", async () => {
      await expect(service.list("user-1", "event-1")).resolves.toBeDefined();
    });

    it("denies a DEPARTMENT-scope manager from a different department", async () => {
      repository.findUserDepartmentId.mockResolvedValue("dept-OTHER");
      await expectCode(
        service.list("user-1", "event-1"),
        SECURITY_ERROR.permissionDenied,
      );
    });

    it("denies a caller with no grant at all", async () => {
      permissions.hasGrant.mockResolvedValue(false);
      await expectCode(
        service.list("user-1", "event-1"),
        SECURITY_ERROR.permissionDenied,
      );
    });

    it("rejects an unknown event before checking authorization", async () => {
      repository.findEventContext.mockResolvedValue(null);
      await expectCode(
        service.list("user-1", "missing-event"),
        ATTENDANCE_ERROR.eventNotFound,
      );
    });
  });

  describe("object-level shift/event binding", () => {
    it("rejects a shift id that belongs to a different event", async () => {
      repository.findById.mockResolvedValue(makeShift({ eventId: "event-OTHER" }));
      await expectCode(
        service.findOne("user-1", "event-1", "shift-1"),
        ATTENDANCE_ERROR.shiftEventMismatch,
      );
    });

    it("rejects an unknown shift id", async () => {
      repository.findById.mockResolvedValue(null);
      await expectCode(
        service.findOne("user-1", "event-1", "missing-shift"),
        ATTENDANCE_ERROR.shiftNotFound,
      );
    });
  });

  describe("create", () => {
    it("rejects a plannedEndAt not after plannedStartAt", async () => {
      await expectCode(
        service.create(
          "user-1",
          "event-1",
          {
            plannedStartAt: "2026-11-01T18:00:00Z",
            plannedEndAt: "2026-11-01T18:00:00Z",
            timeZone: "Africa/Addis_Ababa",
            latitude: 9.03,
            longitude: 38.74,
          },
          "req-1",
        ),
        ATTENDANCE_ERROR.invalidSchedule,
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("accepts an overnight shift crossing midnight as one row", async () => {
      await expect(
        service.create(
          "user-1",
          "event-1",
          {
            plannedStartAt: "2026-11-01T22:00:00Z",
            plannedEndAt: "2026-11-02T04:00:00Z",
            timeZone: "Africa/Addis_Ababa",
            latitude: 9.03,
            longitude: 38.74,
          },
          "req-1",
        ),
      ).resolves.toBeDefined();
      expect(repository.create).toHaveBeenCalled();
    });
  });

  describe("reschedule", () => {
    it("rejects a reschedule with neither field provided", async () => {
      await expectCode(
        service.reschedule("user-1", "event-1", "shift-1", { reason: "x" }, "req-1"),
        ATTENDANCE_ERROR.invalidSchedule,
      );
    });

    it("rejects rescheduling a cancelled shift", async () => {
      repository.findById.mockResolvedValue(
        makeShift({ status: EventShiftStatus.CANCELLED }),
      );
      await expectCode(
        service.reschedule(
          "user-1",
          "event-1",
          "shift-1",
          { plannedStartAt: "2026-11-01T19:00:00Z", reason: "x" },
          "req-1",
        ),
        ATTENDANCE_ERROR.shiftNotAvailable,
      );
    });

    it("classifies a start-time change as RESCHEDULE", async () => {
      await service.reschedule(
        "user-1",
        "event-1",
        "shift-1",
        { plannedStartAt: "2026-11-01T19:00:00Z", reason: "Venue change" },
        "req-1",
      );
      expect(repository.reschedule).toHaveBeenCalledWith(
        "shift-1",
        expect.objectContaining({ changeType: "RESCHEDULE" }),
      );
    });

    it("classifies an end-time-only increase as EXTENSION", async () => {
      await service.reschedule(
        "user-1",
        "event-1",
        "shift-1",
        { plannedEndAt: "2026-11-02T04:00:00Z", reason: "Running late" },
        "req-1",
      );
      expect(repository.reschedule).toHaveBeenCalledWith(
        "shift-1",
        expect.objectContaining({ changeType: "EXTENSION" }),
      );
    });

    it("classifies an end-time-only decrease as RESCHEDULE", async () => {
      await service.reschedule(
        "user-1",
        "event-1",
        "shift-1",
        { plannedEndAt: "2026-11-02T00:00:00Z", reason: "Ending early" },
        "req-1",
      );
      expect(repository.reschedule).toHaveBeenCalledWith(
        "shift-1",
        expect.objectContaining({ changeType: "RESCHEDULE" }),
      );
    });

    it("rejects a resulting end time not after the resulting start time", async () => {
      await expectCode(
        service.reschedule(
          "user-1",
          "event-1",
          "shift-1",
          { plannedStartAt: "2026-11-02T10:00:00Z", reason: "x" },
          "req-1",
        ),
        ATTENDANCE_ERROR.invalidSchedule,
      );
    });
  });

  describe("cancel / reinstate", () => {
    it("rejects cancelling an already-cancelled shift", async () => {
      repository.findById.mockResolvedValue(
        makeShift({ status: EventShiftStatus.CANCELLED }),
      );
      await expectCode(
        service.cancel("user-1", "event-1", "shift-1", { reason: "x" }, "req-1"),
        ATTENDANCE_ERROR.shiftNotAvailable,
      );
    });

    it("rejects reinstating a shift that was never cancelled", async () => {
      await expectCode(
        service.reinstate("user-1", "event-1", "shift-1", { reason: "x" }, "req-1"),
        ATTENDANCE_ERROR.shiftNotCancelled,
      );
    });

    it("reinstates a cancelled shift back to PLANNED", async () => {
      repository.findById.mockResolvedValue(
        makeShift({ status: EventShiftStatus.CANCELLED }),
      );
      await service.reinstate("user-1", "event-1", "shift-1", { reason: "back on" }, "req-1");
      expect(repository.setStatus).toHaveBeenCalledWith(
        "shift-1",
        expect.objectContaining({ status: "PLANNED", changeType: "REINSTATEMENT" }),
      );
    });
  });

  describe("assignments", () => {
    it("rejects assigning an employee who is not active", async () => {
      repository.isActiveEmployee.mockResolvedValue(false);
      await expectCode(
        service.assign("user-1", "event-1", "shift-1", { employeeId: "emp-1" }, "req-1"),
        ATTENDANCE_ERROR.employeeNotFound,
      );
      expect(repository.assign).not.toHaveBeenCalled();
    });

    it("rejects assigning an employee who has approved leave covering the shift", async () => {
      leave.hasApprovedLeaveOverlap.mockResolvedValue(true);
      await expectCode(
        service.assign("user-1", "event-1", "shift-1", { employeeId: "emp-1" }, "req-1"),
        ATTENDANCE_ERROR.leaveConflict,
      );
      expect(repository.assign).not.toHaveBeenCalled();
    });

    it("rejects unassigning an employee with no active assignment", async () => {
      repository.unassign.mockResolvedValue("not_found");
      await expectCode(
        service.unassign("user-1", "event-1", "shift-1", "emp-1", "req-1"),
        ATTENDANCE_ERROR.assignmentNotFound,
      );
    });
  });
});
