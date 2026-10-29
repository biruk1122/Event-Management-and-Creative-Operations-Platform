import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AttendanceRepository } from "../src/attendance/infrastructure/attendance.repository.js";
import { MobileAttendanceRepository } from "../src/attendance/mobile/infrastructure/mobile-attendance.repository.js";
import {
  AttendanceExceptionType,
  AttendanceMethod,
  AttendanceVerificationResult,
  EventShiftStatus,
  PrismaClient,
} from "../src/generated/prisma/client.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

/**
 * Proves the mobile/off-site event attendance flow against real PostgreSQL:
 * assignment-gated eligibility, the geofence center/radius actually stored
 * on the shift (never a client-supplied value), and that an out-of-range
 * or location-unavailable punch really does leave a reviewable
 * `AttendanceException` row behind.
 */
describe("mobile attendance persistence", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let mobile: MobileAttendanceRepository;
  let attendance: AttendanceRepository;

  let employeeId: string;
  let shiftId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: db.url }, { schema: db.schema }),
    });
    mobile = new MobileAttendanceRepository(prisma as never);
    attendance = new AttendanceRepository(prisma as never);

    const employee = await prisma.user.create({
      data: { email: "mobile-employee@attendance.test", status: "ACTIVE" },
    });
    employeeId = employee.id;

    const workspace = await prisma.workspace.create({ data: { kind: "EVENT" } });
    const event = await prisma.event.create({
      data: { workspaceId: workspace.id, name: "Launch Night", eventType: "OTHER" },
    });
    const shift = await prisma.eventShift.create({
      data: {
        eventId: event.id,
        label: "Evening",
        plannedStartAt: new Date("2026-11-01T18:00:00Z"),
        plannedEndAt: new Date("2026-11-02T02:00:00Z"),
        timeZone: "Africa/Addis_Ababa",
        locationLabel: "Main Stage",
        latitude: 9.03,
        longitude: 38.74,
        geofenceRadiusMeters: 150,
        status: EventShiftStatus.CONFIRMED,
      },
    });
    shiftId = shift.id;

    await prisma.eventShiftAssignment.create({
      data: { eventShiftId: shiftId, employeeId },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  it("surfaces the shift's own stored geofence center, radius, and planned window as numbers/dates", async () => {
    const shift = await mobile.findShiftGeofence(shiftId);
    expect(shift).toEqual({
      id: shiftId,
      eventName: "Launch Night",
      status: "CONFIRMED",
      plannedStartAt: new Date("2026-11-01T18:00:00Z"),
      plannedEndAt: new Date("2026-11-02T02:00:00Z"),
      latitude: 9.03,
      longitude: 38.74,
      geofenceRadiusMeters: 150,
    });
  });

  it("lists the shift among the employee's assigned, punchable shifts", async () => {
    const shifts = await mobile.findAssignedShifts(employeeId);
    expect(shifts).toHaveLength(1);
    expect(shifts[0]?.id).toBe(shiftId);
  });

  it("confirms an active assignment exists", async () => {
    expect(await mobile.hasActiveAssignment(shiftId, employeeId)).toBe(true);
  });

  it("checks in within range, leaves no exception, then checks out", async () => {
    const checkIn = await attendance.checkIn({
      employeeId,
      method: AttendanceMethod.MOBILE_EVENT,
      eventShiftId: shiftId,
      clientRequestId: "mobile-checkin-1",
      latitude: 9.03,
      longitude: 38.74,
      accuracyMeters: 10,
      distanceMeters: 0,
      verificationResult: AttendanceVerificationResult.VERIFIED,
    });
    if (checkIn === "already_checked_in") throw new Error("unexpected");
    expect(checkIn.method).toBe("MOBILE_EVENT");
    expect(checkIn.eventShiftId).toBe(shiftId);

    const exceptions = await prisma.attendanceException.findMany({
      where: { employeeId },
    });
    expect(exceptions).toHaveLength(0);

    const checkOut = await attendance.checkOut({
      employeeId,
      clientRequestId: "mobile-checkout-1",
      latitude: 9.03,
      longitude: 38.74,
      accuracyMeters: 10,
      distanceMeters: 0,
      verificationResult: AttendanceVerificationResult.VERIFIED,
    });
    if (checkOut === "no_open_session") throw new Error("unexpected");
    expect(checkOut.status).toBe("CLOSED");
  });

  it("an out-of-range punch leaves a reviewable exception row behind", async () => {
    const checkIn = await attendance.checkIn({
      employeeId,
      method: AttendanceMethod.MOBILE_EVENT,
      eventShiftId: shiftId,
      clientRequestId: "mobile-checkin-2",
      latitude: 10.5,
      longitude: 40.5,
      distanceMeters: 500_000,
      verificationResult: AttendanceVerificationResult.OUT_OF_RANGE,
    });
    if (checkIn === "already_checked_in") throw new Error("unexpected");

    await mobile.createLocationException({
      attendanceSessionId: checkIn.id,
      employeeId,
      type: AttendanceExceptionType.OUT_OF_RANGE,
      description: "Recorded 500000m from Launch Night (allowed radius 150m).",
    });

    const exceptions = await prisma.attendanceException.findMany({
      where: { employeeId, type: "OUT_OF_RANGE" },
    });
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]?.attendanceSessionId).toBe(checkIn.id);
    expect(exceptions[0]?.status).toBe("PENDING");

    await attendance.checkOut({
      employeeId,
      clientRequestId: "mobile-checkout-2",
      latitude: 9.03,
      longitude: 38.74,
      distanceMeters: 0,
      verificationResult: AttendanceVerificationResult.VERIFIED,
    });
  });

  it("no longer reports an active assignment once unassigned", async () => {
    await prisma.eventShiftAssignment.updateMany({
      where: { eventShiftId: shiftId, employeeId },
      data: { unassignedAt: new Date() },
    });
    expect(await mobile.hasActiveAssignment(shiftId, employeeId)).toBe(false);
    expect(await mobile.findAssignedShifts(employeeId)).toHaveLength(0);
  });
});
