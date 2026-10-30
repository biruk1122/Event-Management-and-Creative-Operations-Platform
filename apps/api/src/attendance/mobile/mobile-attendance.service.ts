import { Injectable } from "@nestjs/common";

import { AuditWriterService } from "../../audit/audit-writer.service.js";
import {
  AttendanceExceptionType,
  AttendanceVerificationResult,
  AuditActorKind,
  AuditOutcome,
  AttendanceMethod,
  EventShiftStatus,
  PunchType,
} from "../../generated/prisma/client.js";
import {
  attendanceAlreadyCheckedIn,
  attendanceLeaveConflict,
  attendanceNoOpenSession,
  attendanceNotAssignedToShift,
  attendanceShiftNotAvailable,
  attendanceShiftNotFound,
} from "../attendance.errors.js";
import type { AttendanceSessionResponse } from "../attendance.contracts.js";
import { AttendanceRepository } from "../infrastructure/attendance.repository.js";
import { toAttendanceSessionResponse } from "../attendance-session.mapper.js";
import { haversineDistanceMeters } from "../geofence.js";
import { LeaveRepository } from "../../leave/infrastructure/leave.repository.js";
import {
  MobileAttendanceRepository,
  type ShiftGeofenceRecord,
} from "./infrastructure/mobile-attendance.repository.js";
import type { MobilePunchDto } from "./dto/mobile-punch.dto.js";
import type {
  MobilePunchResponse,
  MyShiftResponse,
} from "./mobile-attendance.contracts.js";

const LOW_ACCURACY_THRESHOLD_METERS = 100;

function resolveVerification(
  location: {
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
  },
  shift: Pick<
    ShiftGeofenceRecord,
    "latitude" | "longitude" | "geofenceRadiusMeters"
  >,
): { result: AttendanceVerificationResult; distanceMeters?: number } {
  if (location.latitude === undefined || location.longitude === undefined) {
    return { result: AttendanceVerificationResult.LOCATION_UNAVAILABLE };
  }

  const distanceMeters = haversineDistanceMeters(
    { latitude: location.latitude, longitude: location.longitude },
    shift,
  );

  if (distanceMeters > shift.geofenceRadiusMeters) {
    return {
      result: AttendanceVerificationResult.OUT_OF_RANGE,
      distanceMeters,
    };
  }
  if (
    location.accuracyMeters !== undefined &&
    location.accuracyMeters > LOW_ACCURACY_THRESHOLD_METERS
  ) {
    return {
      result: AttendanceVerificationResult.LOW_ACCURACY,
      distanceMeters,
    };
  }
  return { result: AttendanceVerificationResult.VERIFIED, distanceMeters };
}

function messageFor(
  punchType: PunchType,
  result: AttendanceVerificationResult,
): string {
  const action =
    punchType === PunchType.CHECK_IN ? "Checked in" : "Checked out";
  switch (result) {
    case AttendanceVerificationResult.OUT_OF_RANGE:
      return `${action}, but you were outside the event location. This has been flagged for manager review.`;
    case AttendanceVerificationResult.LOCATION_UNAVAILABLE:
      return `${action}, but no device location was provided. This has been flagged for manager review.`;
    case AttendanceVerificationResult.LOW_ACCURACY:
      return `${action}. Your device's location accuracy was low.`;
    default:
      return `${action} successfully.`;
  }
}

/**
 * Mobile/off-site event attendance - geofenced, tied to an explicit
 * `EventShiftAssignment`. Unlike the office kiosk, the caller is already a
 * normally-authenticated employee (`AccessTokenGuard`), so there is no
 * separate device/identity verification step here - only the location
 * check, which this service resolves itself before handing the punch to
 * the same shared `AttendanceRepository` the kiosk flow uses. A client's
 * reported distance or accuracy is never trusted on its own: the server
 * always re-measures against the shift's own stored geofence.
 */
@Injectable()
export class MobileAttendanceService {
  constructor(
    private readonly mobile: MobileAttendanceRepository,
    private readonly attendance: AttendanceRepository,
    private readonly audit: AuditWriterService,
    private readonly leave: LeaveRepository,
  ) {}

  async mySessions(employeeId: string): Promise<AttendanceSessionResponse[]> {
    const sessions = await this.attendance.listSessionsForEmployee(
      employeeId,
      25,
    );
    return sessions.map(toAttendanceSessionResponse);
  }

  async myShifts(employeeId: string): Promise<MyShiftResponse[]> {
    const shifts = await this.mobile.findAssignedShifts(employeeId);
    return shifts.map((shift) => ({
      id: shift.id,
      eventName: shift.eventName,
      label: shift.label,
      plannedStartAt: shift.plannedStartAt.toISOString(),
      plannedEndAt: shift.plannedEndAt.toISOString(),
      timeZone: shift.timeZone,
      locationLabel: shift.locationLabel,
      status: shift.status,
    }));
  }

  async punch(
    employeeId: string,
    dto: MobilePunchDto,
    requestId: string,
  ): Promise<MobilePunchResponse> {
    if (dto.punchType === PunchType.CHECK_IN) {
      return this.checkIn(employeeId, dto, requestId);
    }
    return this.checkOut(employeeId, dto, requestId);
  }

  private async checkIn(
    employeeId: string,
    dto: MobilePunchDto,
    requestId: string,
  ): Promise<MobilePunchResponse> {
    const eventShiftId = dto.eventShiftId!;
    const shift = await this.mobile.findShiftGeofence(eventShiftId);
    if (!shift) throw attendanceShiftNotFound();
    if (
      shift.status === EventShiftStatus.CANCELLED ||
      shift.status === EventShiftStatus.COMPLETED
    ) {
      throw attendanceShiftNotAvailable();
    }
    if (!(await this.mobile.hasActiveAssignment(eventShiftId, employeeId))) {
      throw attendanceNotAssignedToShift();
    }
    if (
      await this.leave.hasApprovedLeaveOverlap(
        employeeId,
        shift.plannedStartAt,
        shift.plannedEndAt,
      )
    ) {
      throw attendanceLeaveConflict();
    }

    const { result, distanceMeters } = resolveVerification(dto, shift);

    const checkIn = await this.attendance.checkIn({
      employeeId,
      method: AttendanceMethod.MOBILE_EVENT,
      eventShiftId,
      clientRequestId: dto.clientRequestId,
      verificationResult: result,
      ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
      ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
      ...(dto.accuracyMeters !== undefined
        ? { accuracyMeters: dto.accuracyMeters }
        : {}),
      ...(distanceMeters !== undefined ? { distanceMeters } : {}),
    });
    if (checkIn === "already_checked_in") throw attendanceAlreadyCheckedIn();

    await this.flagIfNeeded(
      checkIn.id,
      employeeId,
      result,
      distanceMeters,
      shift,
    );
    await this.audit.record({
      action: "attendance.checked_in",
      actorKind: AuditActorKind.USER,
      actorUserId: employeeId,
      requestId,
      resourceType: "attendance_session",
      resourceId: checkIn.id,
      outcome: AuditOutcome.SUCCEEDED,
      metadata: {
        method: "MOBILE_EVENT",
        eventShiftId,
        verificationResult: result,
      },
    });

    return {
      session: toAttendanceSessionResponse(checkIn),
      verificationResult: result,
      message: messageFor(PunchType.CHECK_IN, result),
    };
  }

  private async checkOut(
    employeeId: string,
    dto: MobilePunchDto,
    requestId: string,
  ): Promise<MobilePunchResponse> {
    const open = await this.attendance.findOpenSession(employeeId);
    if (!open) throw attendanceNoOpenSession();

    let result: AttendanceVerificationResult =
      AttendanceVerificationResult.NOT_APPLICABLE;
    let distanceMeters: number | undefined;
    let shift: ShiftGeofenceRecord | null = null;
    if (open.eventShiftId) {
      shift = await this.mobile.findShiftGeofence(open.eventShiftId);
    }
    if (shift) {
      ({ result, distanceMeters } = resolveVerification(dto, shift));
    } else if (open.method === AttendanceMethod.MOBILE_EVENT) {
      // The shift this session was opened against is no longer resolvable
      // (e.g. deleted after check-in) - a MOBILE_EVENT punch may never
      // carry NOT_APPLICABLE (database CHECK), and "unknown" is honestly
      // closer to "could not verify" than a fabricated VERIFIED.
      result = AttendanceVerificationResult.LOCATION_UNAVAILABLE;
    }

    const checkOut = await this.attendance.checkOut({
      employeeId,
      clientRequestId: dto.clientRequestId,
      verificationResult: result,
      ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
      ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
      ...(dto.accuracyMeters !== undefined
        ? { accuracyMeters: dto.accuracyMeters }
        : {}),
      ...(distanceMeters !== undefined ? { distanceMeters } : {}),
    });
    if (checkOut === "no_open_session") throw attendanceNoOpenSession();

    await this.flagIfNeeded(
      checkOut.id,
      employeeId,
      result,
      distanceMeters,
      shift,
    );
    await this.audit.record({
      action: "attendance.checked_out",
      actorKind: AuditActorKind.USER,
      actorUserId: employeeId,
      requestId,
      resourceType: "attendance_session",
      resourceId: checkOut.id,
      outcome: AuditOutcome.SUCCEEDED,
      metadata: {
        method: "MOBILE_EVENT",
        eventShiftId: open.eventShiftId,
        verificationResult: result,
      },
    });

    return {
      session: toAttendanceSessionResponse(checkOut),
      verificationResult: result,
      message: messageFor(PunchType.CHECK_OUT, result),
    };
  }

  /** Only a genuinely unverifiable location (out of range, or none at all)
   * is left for a manager to review; a merely low-accuracy reading is
   * recorded honestly on the punch itself without raising a review item. */
  private async flagIfNeeded(
    attendanceSessionId: string,
    employeeId: string,
    result: AttendanceVerificationResult,
    distanceMeters: number | undefined,
    shift: ShiftGeofenceRecord | null,
  ): Promise<void> {
    if (result === AttendanceVerificationResult.OUT_OF_RANGE) {
      await this.mobile.createLocationException({
        attendanceSessionId,
        employeeId,
        type: AttendanceExceptionType.OUT_OF_RANGE,
        description: shift
          ? `Recorded ${Math.round(distanceMeters ?? 0)}m from ${shift.eventName} (allowed radius ${shift.geofenceRadiusMeters}m).`
          : "Recorded outside the event location (the event shift record is no longer available).",
      });
      return;
    }
    if (result === AttendanceVerificationResult.LOCATION_UNAVAILABLE) {
      await this.mobile.createLocationException({
        attendanceSessionId,
        employeeId,
        type: AttendanceExceptionType.LOCATION_UNAVAILABLE,
        description: shift
          ? `No device location was provided for ${shift.eventName}.`
          : "No device location was provided, and the event shift record is no longer available.",
      });
    }
  }
}
