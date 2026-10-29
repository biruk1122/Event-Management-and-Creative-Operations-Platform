import { Injectable } from "@nestjs/common";

import {
  AttendanceDayType,
  AttendanceMethod,
  AttendanceSessionStatus,
  AttendanceVerificationResult,
  Prisma,
  PunchType,
} from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID.test(value);
}

export interface AttendanceSessionRecord {
  id: string;
  employeeId: string;
  employeeName: string | null;
  method: AttendanceMethod;
  kioskId: string | null;
  kioskName: string | null;
  eventShiftId: string | null;
  eventName: string | null;
  sessionDate: Date;
  checkInAt: Date;
  checkOutAt: Date | null;
  status: AttendanceSessionStatus;
  scheduledMinutes: number | null;
  actualMinutes: number | null;
  breakMinutes: number;
  netMinutes: number | null;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  potentialOvertimeMinutes: number;
}

const SESSION_SELECT = {
  id: true,
  employeeId: true,
  employee: { select: { firstName: true, lastName: true, email: true } },
  method: true,
  kioskId: true,
  kiosk: { select: { name: true } },
  eventShiftId: true,
  eventShift: { select: { event: { select: { name: true } } } },
  sessionDate: true,
  checkInPunch: { select: { recordedAt: true } },
  checkOutPunch: { select: { recordedAt: true } },
  status: true,
  scheduledMinutes: true,
  actualMinutes: true,
  breakMinutes: true,
  netMinutes: true,
  lateMinutes: true,
  earlyDepartureMinutes: true,
  potentialOvertimeMinutes: true,
} as const;

type RawSession = Prisma.AttendanceSessionGetPayload<{
  select: typeof SESSION_SELECT;
}>;

function personName(
  person: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null,
): string | null {
  if (!person) return null;
  const name = [person.firstName, person.lastName]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  return name.length > 0 ? name : person.email;
}

function toRecord(raw: RawSession): AttendanceSessionRecord {
  return {
    id: raw.id,
    employeeId: raw.employeeId,
    employeeName: personName(raw.employee),
    method: raw.method,
    kioskId: raw.kioskId,
    kioskName: raw.kiosk?.name ?? null,
    eventShiftId: raw.eventShiftId,
    eventName: raw.eventShift?.event.name ?? null,
    sessionDate: raw.sessionDate,
    checkInAt: raw.checkInPunch.recordedAt,
    checkOutAt: raw.checkOutPunch?.recordedAt ?? null,
    status: raw.status,
    scheduledMinutes: raw.scheduledMinutes,
    actualMinutes: raw.actualMinutes,
    breakMinutes: raw.breakMinutes,
    netMinutes: raw.netMinutes,
    lateMinutes: raw.lateMinutes,
    earlyDepartureMinutes: raw.earlyDepartureMinutes,
    potentialOvertimeMinutes: raw.potentialOvertimeMinutes,
  };
}

export interface WeekdayScheduleRecord {
  dayOfWeek: number;
  type: AttendanceDayType;
  effectiveFrom: Date;
}

export interface HolidayRecord {
  id: string;
  date: Date;
  name: string;
  createdByName: string | null;
  createdAt: Date;
}

/** `HALF` and `FULL` are both working days; an `OFF`-resolved date (a
 * weekend-off weekday, or a holiday overriding any weekday type) is simply
 * absent from the map `resolveWorkingDays` returns - there is no `"OFF"`
 * member here on purpose. */
export type WorkingDayType = "FULL" | "HALF";

const HOLIDAY_SELECT = {
  id: true,
  date: true,
  name: true,
  createdAt: true,
  createdBy: { select: { firstName: true, lastName: true, email: true } },
} as const;

type RawHoliday = Prisma.AttendanceHolidayGetPayload<{
  select: typeof HOLIDAY_SELECT;
}>;

function toHolidayRecord(raw: RawHoliday): HolidayRecord {
  return {
    id: raw.id,
    date: raw.date,
    name: raw.name,
    createdByName: personName(raw.createdBy),
    createdAt: raw.createdAt,
  };
}

export interface CheckInInput {
  employeeId: string;
  method: AttendanceMethod;
  kioskId?: string;
  eventShiftId?: string;
  clientRequestId: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  distanceMeters?: number;
  verificationResult: AttendanceVerificationResult;
}

export interface CheckOutInput {
  employeeId: string;
  clientRequestId: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  distanceMeters?: number;
  verificationResult: AttendanceVerificationResult;
}

/** Minutes late at check-in, minutes early at check-out, and minutes beyond
 * the planned end still worked - all zero unless a planned shift window is
 * supplied (office-kiosk sessions have none). Never negative. */
export function computeScheduleDeltas(input: {
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  checkInAt: Date;
  checkOutAt: Date;
}): {
  lateMinutes: number;
  earlyDepartureMinutes: number;
  potentialOvertimeMinutes: number;
} {
  if (!input.plannedStartAt || !input.plannedEndAt) {
    return { lateMinutes: 0, earlyDepartureMinutes: 0, potentialOvertimeMinutes: 0 };
  }
  const lateMinutes = Math.max(
    0,
    Math.round(
      (input.checkInAt.getTime() - input.plannedStartAt.getTime()) / 60_000,
    ),
  );
  const earlyDepartureMinutes = Math.max(
    0,
    Math.round(
      (input.plannedEndAt.getTime() - input.checkOutAt.getTime()) / 60_000,
    ),
  );
  const potentialOvertimeMinutes = Math.max(
    0,
    Math.round(
      (input.checkOutAt.getTime() - input.plannedEndAt.getTime()) / 60_000,
    ),
  );
  return { lateMinutes, earlyDepartureMinutes, potentialOvertimeMinutes };
}

@Injectable()
export class AttendanceRepository {
  constructor(private readonly db: DatabaseService) {}

  async findOpenSession(
    employeeId: string,
  ): Promise<AttendanceSessionRecord | null> {
    if (!isUuid(employeeId)) return null;
    const raw = await this.db.attendanceSession.findFirst({
      where: { employeeId, status: "OPEN" },
      select: SESSION_SELECT,
    });
    return raw ? toRecord(raw) : null;
  }

  async findSessionById(id: string): Promise<AttendanceSessionRecord | null> {
    if (!isUuid(id)) return null;
    const raw = await this.db.attendanceSession.findUnique({
      where: { id },
      select: SESSION_SELECT,
    });
    return raw ? toRecord(raw) : null;
  }

  /** The employee's own recent sessions, most recent first - what a
   * self-service "my attendance" view reads, independent of any particular
   * punch response (so it still shows the right thing after a refresh). */
  async listSessionsForEmployee(
    employeeId: string,
    limit: number,
  ): Promise<AttendanceSessionRecord[]> {
    if (!isUuid(employeeId)) return [];
    const rows = await this.db.attendanceSession.findMany({
      where: { employeeId },
      select: SESSION_SELECT,
      orderBy: { checkInPunch: { recordedAt: "desc" } },
      take: limit,
    });
    return rows.map(toRecord);
  }

  /** Cross-employee attendance sessions in a date range, optionally
   * narrowed to one employee, most recent first - the detailed, per-punch
   * list that only Super Admin and the HR & Executive Officer department's
   * own manager may reach (the service layer enforces that; this method has
   * no department scoping of its own - HR sees the whole roster, not just
   * HR's own department). */
  async listSessions(input: {
    startDate: Date;
    endDate: Date;
    employeeId?: string;
  }): Promise<AttendanceSessionRecord[]> {
    const rows = await this.db.attendanceSession.findMany({
      where: {
        sessionDate: { gte: input.startDate, lte: input.endDate },
        ...(input.employeeId ? { employeeId: input.employeeId } : {}),
      },
      select: SESSION_SELECT,
      orderBy: [
        { sessionDate: "desc" },
        { checkInPunch: { recordedAt: "desc" } },
      ],
    });
    return rows.map(toRecord);
  }

  /**
   * Opens a session. `clientRequestId` makes a retried check-in idempotent:
   * a repeated request with the same key resolves to the already-created
   * session rather than a second one. A genuine second check-in while one
   * is already open is rejected by the partial unique index on
   * `attendance_sessions` (`status = 'OPEN'`), not by an application-level
   * read-then-write race.
   */
  async checkIn(
    input: CheckInInput,
  ): Promise<AttendanceSessionRecord | "already_checked_in"> {
    try {
      return await this.runCheckIn(input);
    } catch (error) {
      // A unique violation here means the *punch* insert itself collided on
      // `clientRequestId` (a retried request) - by this point Prisma has
      // already rolled the transaction back. Postgres refuses any further
      // statement inside an aborted transaction (error 25P02), so the
      // retry's own lookup must run as a fresh statement via `this.db`,
      // never against the now-dead `tx` that threw.
      if (isUniqueViolation(error)) {
        const existing = await this.db.attendancePunch.findUnique({
          where: {
            employeeId_punchType_clientRequestId: {
              employeeId: input.employeeId,
              punchType: PunchType.CHECK_IN,
              clientRequestId: input.clientRequestId,
            },
          },
          select: { id: true },
        });
        if (existing) {
          const session = await this.db.attendanceSession.findUnique({
            where: { checkInPunchId: existing.id },
            select: SESSION_SELECT,
          });
          if (session) return toRecord(session);
        }
      }
      throw error;
    }
  }

  private async runCheckIn(
    input: CheckInInput,
  ): Promise<AttendanceSessionRecord | "already_checked_in"> {
    return this.db.$transaction(async (tx) => {
      const punch = await tx.attendancePunch.create({
        data: {
          employeeId: input.employeeId,
          method: input.method,
          punchType: PunchType.CHECK_IN,
          clientRequestId: input.clientRequestId,
          verificationResult: input.verificationResult,
          ...(input.kioskId ? { kioskId: input.kioskId } : {}),
          ...(input.eventShiftId ? { eventShiftId: input.eventShiftId } : {}),
          ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
          ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
          ...(input.accuracyMeters !== undefined
            ? { accuracyMeters: input.accuracyMeters }
            : {}),
          ...(input.distanceMeters !== undefined
            ? { distanceMeters: input.distanceMeters }
            : {}),
        },
        select: { id: true, recordedAt: true },
      });

      let scheduledMinutes: number | null = null;
      let lateMinutes = 0;
      if (input.eventShiftId) {
        const shift = await tx.eventShift.findUnique({
          where: { id: input.eventShiftId },
          select: { plannedStartAt: true, plannedEndAt: true },
        });
        if (shift) {
          scheduledMinutes = Math.round(
            (shift.plannedEndAt.getTime() - shift.plannedStartAt.getTime()) /
              60_000,
          );
          lateMinutes = computeScheduleDeltas({
            plannedStartAt: shift.plannedStartAt,
            plannedEndAt: shift.plannedEndAt,
            checkInAt: punch.recordedAt,
            checkOutAt: punch.recordedAt,
          }).lateMinutes;
        }
      }

      try {
        const session = await tx.attendanceSession.create({
          data: {
            employeeId: input.employeeId,
            method: input.method,
            sessionDate: toDateOnly(punch.recordedAt),
            checkInPunchId: punch.id,
            scheduledMinutes,
            lateMinutes,
            ...(input.kioskId ? { kioskId: input.kioskId } : {}),
            ...(input.eventShiftId ? { eventShiftId: input.eventShiftId } : {}),
          },
          select: SESSION_SELECT,
        });
        return toRecord(session);
      } catch (error) {
        if (isUniqueViolation(error)) return "already_checked_in";
        throw error;
      }
    });
  }

  /**
   * Closes the caller's one open session. Idempotent the same way
   * `checkIn` is: a retried checkout with the same `clientRequestId`
   * resolves to the session the first attempt already closed.
   */
  async checkOut(
    input: CheckOutInput,
  ): Promise<AttendanceSessionRecord | "no_open_session"> {
    return this.db.$transaction(async (tx) => {
      const existingPunch = await tx.attendancePunch.findUnique({
        where: {
          employeeId_punchType_clientRequestId: {
            employeeId: input.employeeId,
            punchType: PunchType.CHECK_OUT,
            clientRequestId: input.clientRequestId,
          },
        },
        select: { id: true },
      });
      if (existingPunch) {
        const session = await tx.attendanceSession.findUnique({
          where: { checkOutPunchId: existingPunch.id },
          select: SESSION_SELECT,
        });
        if (session) return toRecord(session);
      }

      const open = await tx.attendanceSession.findFirst({
        where: { employeeId: input.employeeId, status: "OPEN" },
        select: {
          id: true,
          method: true,
          kioskId: true,
          breakMinutes: true,
          eventShiftId: true,
          checkInPunch: { select: { recordedAt: true } },
        },
      });
      if (!open) return "no_open_session";

      const checkOutPunch = await tx.attendancePunch.create({
        data: {
          employeeId: input.employeeId,
          method: open.method,
          punchType: PunchType.CHECK_OUT,
          clientRequestId: input.clientRequestId,
          verificationResult: input.verificationResult,
          ...(open.kioskId ? { kioskId: open.kioskId } : {}),
          ...(open.eventShiftId ? { eventShiftId: open.eventShiftId } : {}),
          ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
          ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
          ...(input.accuracyMeters !== undefined
            ? { accuracyMeters: input.accuracyMeters }
            : {}),
          ...(input.distanceMeters !== undefined
            ? { distanceMeters: input.distanceMeters }
            : {}),
        },
        select: { id: true, recordedAt: true },
      });

      const actualMinutes = Math.max(
        0,
        Math.round(
          (checkOutPunch.recordedAt.getTime() -
            open.checkInPunch.recordedAt.getTime()) /
            60_000,
        ),
      );
      const netMinutes = Math.max(0, actualMinutes - open.breakMinutes);

      let earlyDepartureMinutes = 0;
      let potentialOvertimeMinutes = 0;
      if (open.eventShiftId) {
        const shift = await tx.eventShift.findUnique({
          where: { id: open.eventShiftId },
          select: { plannedStartAt: true, plannedEndAt: true },
        });
        if (shift) {
          const deltas = computeScheduleDeltas({
            plannedStartAt: shift.plannedStartAt,
            plannedEndAt: shift.plannedEndAt,
            checkInAt: open.checkInPunch.recordedAt,
            checkOutAt: checkOutPunch.recordedAt,
          });
          earlyDepartureMinutes = deltas.earlyDepartureMinutes;
          potentialOvertimeMinutes = deltas.potentialOvertimeMinutes;
        }
      }

      const updated = await tx.attendanceSession.update({
        where: { id: open.id },
        data: {
          checkOutPunchId: checkOutPunch.id,
          status: AttendanceSessionStatus.CLOSED,
          actualMinutes,
          netMinutes,
          earlyDepartureMinutes,
          potentialOvertimeMinutes,
        },
        select: SESSION_SELECT,
      });

      if (potentialOvertimeMinutes > 0) {
        await tx.attendanceOvertimeApproval.create({
          data: {
            attendanceSessionId: updated.id,
            potentialMinutes: potentialOvertimeMinutes,
          },
        });
      }

      return toRecord(updated);
    });
  }

  // -------------------------------------------------------------------
  // Work calendar (weekly schedule + holidays)
  // -------------------------------------------------------------------

  /** Each weekday's *current* (as-of-today) effective type - the admin
   * listing view. `resolveWorkingDays` below is what actually walks a date
   * range against the full effective-dated history. */
  async listWeekdaySchedule(): Promise<WeekdayScheduleRecord[]> {
    const rows = await this.db.attendanceWeekdaySchedule.findMany({
      where: { effectiveFrom: { lte: new Date() } },
      orderBy: { effectiveFrom: "desc" },
    });
    const latestByDay = new Map<number, WeekdayScheduleRecord>();
    for (const row of rows) {
      if (!latestByDay.has(row.dayOfWeek)) {
        latestByDay.set(row.dayOfWeek, {
          dayOfWeek: row.dayOfWeek,
          type: row.type,
          effectiveFrom: row.effectiveFrom,
        });
      }
    }
    return [...latestByDay.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  }

  /** Changing a weekday's type INSERTS a new effective-dated row - existing
   * rows are never mutated, so a report for a past date keeps resolving the
   * rule that was actually in effect then. */
  async createWeekdaySchedule(input: {
    dayOfWeek: number;
    type: AttendanceDayType;
    effectiveFrom: Date;
    createdById?: string;
  }): Promise<WeekdayScheduleRecord | "already_effective"> {
    try {
      const row = await this.db.attendanceWeekdaySchedule.create({
        data: {
          dayOfWeek: input.dayOfWeek,
          type: input.type,
          effectiveFrom: input.effectiveFrom,
          ...(input.createdById ? { createdById: input.createdById } : {}),
        },
      });
      return { dayOfWeek: row.dayOfWeek, type: row.type, effectiveFrom: row.effectiveFrom };
    } catch (error) {
      if (isUniqueViolation(error)) return "already_effective";
      throw error;
    }
  }

  async listHolidays(): Promise<HolidayRecord[]> {
    const rows = await this.db.attendanceHoliday.findMany({
      select: HOLIDAY_SELECT,
      orderBy: { date: "asc" },
    });
    return rows.map(toHolidayRecord);
  }

  async findHolidayById(id: string): Promise<HolidayRecord | null> {
    if (!isUuid(id)) return null;
    const row = await this.db.attendanceHoliday.findUnique({
      where: { id },
      select: HOLIDAY_SELECT,
    });
    return row ? toHolidayRecord(row) : null;
  }

  async createHoliday(input: {
    date: Date;
    name: string;
    createdById?: string;
  }): Promise<HolidayRecord | "date_taken"> {
    try {
      const row = await this.db.attendanceHoliday.create({
        data: {
          date: input.date,
          name: input.name,
          ...(input.createdById ? { createdById: input.createdById } : {}),
        },
        select: HOLIDAY_SELECT,
      });
      return toHolidayRecord(row);
    } catch (error) {
      if (isUniqueViolation(error)) return "date_taken";
      throw error;
    }
  }

  async updateHoliday(
    id: string,
    input: { date?: Date; name?: string },
  ): Promise<HolidayRecord | "not_found" | "date_taken"> {
    if (!isUuid(id)) return "not_found";
    try {
      const row = await this.db.attendanceHoliday.update({
        where: { id },
        data: {
          ...(input.date !== undefined ? { date: input.date } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
        },
        select: HOLIDAY_SELECT,
      });
      return toHolidayRecord(row);
    } catch (error) {
      if (isUniqueViolation(error)) return "date_taken";
      if (isRecordNotFound(error)) return "not_found";
      throw error;
    }
  }

  async removeHoliday(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    try {
      await this.db.attendanceHoliday.delete({ where: { id } });
      return true;
    } catch (error) {
      if (isRecordNotFound(error)) return false;
      throw error;
    }
  }

  /**
   * Expands `[startDate, endDate]` (both inclusive) into the subset of
   * dates that are actual working days - the single source both the
   * calendar-management endpoints and `summarize()`'s per-day Present/
   * Absent/Scheduled walk share, so "a holiday overrides the weekly
   * schedule" is expressed in exactly one place. A date resolves to `OFF`
   * (and so is simply absent from the returned map) when either a holiday
   * covers it, or - failing that - the weekday schedule effective on that
   * date (the most recent `effectiveFrom <= date` row for that weekday) is
   * `OFF`. Loads the full schedule history and the in-range holidays once,
   * never one query per date.
   */
  async resolveWorkingDays(
    startDate: Date,
    endDate: Date,
  ): Promise<Map<string, WorkingDayType>> {
    const [scheduleRows, holidayRows] = await Promise.all([
      this.db.attendanceWeekdaySchedule.findMany({
        orderBy: { effectiveFrom: "asc" },
        select: { dayOfWeek: true, type: true, effectiveFrom: true },
      }),
      this.db.attendanceHoliday.findMany({
        where: { date: { gte: startDate, lte: endDate } },
        select: { date: true },
      }),
    ]);

    const byDayOfWeek = new Map<
      number,
      { type: AttendanceDayType; effectiveFrom: Date }[]
    >();
    for (const row of scheduleRows) {
      const list = byDayOfWeek.get(row.dayOfWeek) ?? [];
      list.push({ type: row.type, effectiveFrom: row.effectiveFrom });
      byDayOfWeek.set(row.dayOfWeek, list);
    }

    const holidays = new Set(
      holidayRows.map((row) => row.date.toISOString().slice(0, 10)),
    );

    const workingDays = new Map<string, WorkingDayType>();
    for (
      let cursor = new Date(startDate);
      cursor.getTime() <= endDate.getTime();
      cursor = new Date(cursor.getTime() + 86_400_000)
    ) {
      const iso = cursor.toISOString().slice(0, 10);
      if (holidays.has(iso)) continue;

      const entries = byDayOfWeek.get(cursor.getUTCDay()) ?? [];
      let resolved: AttendanceDayType = AttendanceDayType.FULL;
      for (const entry of entries) {
        if (entry.effectiveFrom.getTime() > cursor.getTime()) break;
        resolved = entry.type;
      }
      if (resolved === AttendanceDayType.OFF) continue;
      workingDays.set(iso, resolved === AttendanceDayType.HALF ? "HALF" : "FULL");
    }
    return workingDays;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function isRecordNotFound(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}

function toDateOnly(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}
