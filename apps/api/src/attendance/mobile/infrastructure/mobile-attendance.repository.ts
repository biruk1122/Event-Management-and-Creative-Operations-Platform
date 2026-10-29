import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../../../database/database.service.js";
import {
  AttendanceExceptionType,
  EventShiftStatus,
} from "../../../generated/prisma/client.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID.test(value);
}

export interface AssignedShiftRecord {
  id: string;
  eventName: string;
  label: string | null;
  plannedStartAt: Date;
  plannedEndAt: Date;
  timeZone: string;
  locationLabel: string | null;
  status: EventShiftStatus;
}

export interface ShiftGeofenceRecord {
  id: string;
  eventName: string;
  status: EventShiftStatus;
  plannedStartAt: Date;
  plannedEndAt: Date;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
}

const SHIFT_SELECT = {
  id: true,
  label: true,
  plannedStartAt: true,
  plannedEndAt: true,
  timeZone: true,
  locationLabel: true,
  status: true,
  event: { select: { name: true } },
} as const;

@Injectable()
export class MobileAttendanceRepository {
  constructor(private readonly db: DatabaseService) {}

  /** Shifts the employee is currently (not unassigned) assigned to and that
   * are still eligible to punch against - not yet completed or cancelled. */
  async findAssignedShifts(employeeId: string): Promise<AssignedShiftRecord[]> {
    if (!isUuid(employeeId)) return [];
    const rows = await this.db.eventShiftAssignment.findMany({
      where: {
        employeeId,
        unassignedAt: null,
        eventShift: {
          status: { in: [EventShiftStatus.PLANNED, EventShiftStatus.CONFIRMED, EventShiftStatus.IN_PROGRESS] },
        },
      },
      select: { eventShift: { select: SHIFT_SELECT } },
      orderBy: { eventShift: { plannedStartAt: "asc" } },
    });
    return rows.map((row) => ({
      id: row.eventShift.id,
      eventName: row.eventShift.event.name,
      label: row.eventShift.label,
      plannedStartAt: row.eventShift.plannedStartAt,
      plannedEndAt: row.eventShift.plannedEndAt,
      timeZone: row.eventShift.timeZone,
      locationLabel: row.eventShift.locationLabel,
      status: row.eventShift.status,
    }));
  }

  /** Whether an active (not unassigned) assignment ties this employee to
   * this shift - the eligibility gate the mobile check-in enforces. */
  async hasActiveAssignment(
    eventShiftId: string,
    employeeId: string,
  ): Promise<boolean> {
    if (!isUuid(eventShiftId) || !isUuid(employeeId)) return false;
    const count = await this.db.eventShiftAssignment.count({
      where: { eventShiftId, employeeId, unassignedAt: null },
    });
    return count === 1;
  }

  /** The shift's own geofence center/radius and lifecycle status - never
   * trust a client-supplied distance; this is what the server measures
   * against. */
  async findShiftGeofence(id: string): Promise<ShiftGeofenceRecord | null> {
    if (!isUuid(id)) return null;
    const shift = await this.db.eventShift.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        plannedStartAt: true,
        plannedEndAt: true,
        latitude: true,
        longitude: true,
        geofenceRadiusMeters: true,
        event: { select: { name: true } },
      },
    });
    if (!shift) return null;
    return {
      id: shift.id,
      eventName: shift.event.name,
      status: shift.status,
      plannedStartAt: shift.plannedStartAt,
      plannedEndAt: shift.plannedEndAt,
      latitude: shift.latitude.toNumber(),
      longitude: shift.longitude.toNumber(),
      geofenceRadiusMeters: shift.geofenceRadiusMeters,
    };
  }

  /** Raised automatically by an out-of-range or location-unavailable
   * mobile punch - never silently dropped, always left for a manager's
   * `attendance.exception.review`. */
  async createLocationException(input: {
    attendanceSessionId: string;
    employeeId: string;
    type: AttendanceExceptionType;
    description: string;
  }): Promise<void> {
    await this.db.attendanceException.create({
      data: {
        attendanceSessionId: input.attendanceSessionId,
        employeeId: input.employeeId,
        type: input.type,
        description: input.description,
      },
    });
  }
}
