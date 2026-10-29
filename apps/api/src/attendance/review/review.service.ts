import { Injectable } from "@nestjs/common";

import { AuditWriterService } from "../../audit/audit-writer.service.js";
import { isHrExecutiveOfficerManager } from "../../common/security/department-access.policy.js";
import { PermissionsService } from "../../common/security/permissions.service.js";
import { permissionDenied } from "../../common/security/security.errors.js";
import {
  AttendanceExceptionStatus,
  AttendanceOvertimeStatus,
  AuditActorKind,
  AuditOutcome,
  type PermissionScope,
} from "../../generated/prisma/client.js";
import {
  attendanceExceptionAlreadyDecided,
  attendanceExceptionNotFound,
  attendanceHolidayDateTaken,
  attendanceHolidayNotFound,
  attendanceOvertimeAlreadyDecided,
  attendanceOvertimeNotFound,
  attendanceSelfApprovalForbidden,
  attendanceWeekdayScheduleConflict,
} from "../attendance.errors.js";
import type { AttendanceSessionResponse } from "../attendance.contracts.js";
import { toAttendanceSessionResponse } from "../attendance-session.mapper.js";
import {
  AttendanceRepository,
  type HolidayRecord,
  type WeekdayScheduleRecord,
} from "../infrastructure/attendance.repository.js";
import { LeaveRepository } from "../../leave/infrastructure/leave.repository.js";
import type { CreateHolidayDto } from "./dto/create-holiday.dto.js";
import type { CreateWeekdayScheduleDto } from "./dto/create-weekday-schedule.dto.js";
import type { DecideExceptionDto } from "./dto/decide-exception.dto.js";
import type { DecideOvertimeDto } from "./dto/decide-overtime.dto.js";
import type { UpdateHolidayDto } from "./dto/update-holiday.dto.js";
import {
  AttendanceReviewRepository,
  type ExceptionRecord,
  type OvertimeApprovalRecord,
} from "./infrastructure/review.repository.js";
import {
  AttendanceExceptionResponse,
  AttendanceHolidayResponse,
  AttendanceSummaryResponse,
  AttendanceWeekdayScheduleResponse,
  OvertimeApprovalResponse,
} from "./review.contracts.js";

const OVERTIME_PERMISSION = "attendance.overtime.review";
const EXCEPTION_PERMISSION = "attendance.exception.review";
const REPORTS_PERMISSION = "attendance.reports.read";
const CALENDAR_PERMISSION = "attendance.calendar.manage";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function toWeekdayScheduleResponse(
  record: WeekdayScheduleRecord,
): AttendanceWeekdayScheduleResponse {
  return {
    dayOfWeek: record.dayOfWeek,
    dayName: DAY_NAMES[record.dayOfWeek] ?? "Unknown",
    type: record.type,
    effectiveFrom: record.effectiveFrom.toISOString().slice(0, 10),
  };
}

function toHolidayResponse(record: HolidayRecord): AttendanceHolidayResponse {
  return {
    id: record.id,
    date: record.date.toISOString().slice(0, 10),
    name: record.name,
    createdByName: record.createdByName,
    createdAt: record.createdAt.toISOString(),
  };
}

/** Every ISO date (`YYYY-MM-DD`) in the intersection of `[start, end]` and
 * `[rangeStart, rangeEnd]` (all inclusive) - used to clip an approved leave
 * request's own date span down to the report's requested range. */
function clippedIsoDates(
  start: Date,
  end: Date,
  rangeStart: Date,
  rangeEnd: Date,
): string[] {
  const from = start > rangeStart ? start : rangeStart;
  const to = end < rangeEnd ? end : rangeEnd;
  const dates: string[] = [];
  for (
    let cursor = new Date(from);
    cursor.getTime() <= to.getTime();
    cursor = new Date(cursor.getTime() + 86_400_000)
  ) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

function toOvertimeResponse(record: OvertimeApprovalRecord): OvertimeApprovalResponse {
  return {
    id: record.id,
    attendanceSessionId: record.attendanceSessionId,
    employeeId: record.employeeId,
    employeeName: record.employeeName,
    sessionDate: record.sessionDate.toISOString().slice(0, 10),
    potentialMinutes: record.potentialMinutes,
    requestedReason: record.requestedReason,
    status: record.status,
    approvedMinutes: record.approvedMinutes,
    decisionReason: record.decisionReason,
    decidedByName: record.decidedByName,
    decidedAt: record.decidedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

function toExceptionResponse(record: ExceptionRecord): AttendanceExceptionResponse {
  return {
    id: record.id,
    attendanceSessionId: record.attendanceSessionId,
    employeeId: record.employeeId,
    employeeName: record.employeeName,
    type: record.type,
    description: record.description,
    requestedCheckInAt: record.requestedCheckInAt?.toISOString() ?? null,
    requestedCheckOutAt: record.requestedCheckOutAt?.toISOString() ?? null,
    status: record.status,
    reviewNote: record.reviewNote,
    reviewedByName: record.reviewedByName,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * Overtime and exception review - a Department Manager reviews their own
 * department's employees (resolved via the target employee's own
 * `departmentId`, the same `findUserDepartmentId` pattern used across the
 * codebase for DEPARTMENT-scope object checks), Super Admin reviews
 * everyone. Self-approval is refused unconditionally, before and
 * regardless of scope - organization-wide access never overrides it.
 */
@Injectable()
export class AttendanceReviewService {
  constructor(
    private readonly repository: AttendanceReviewRepository,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditWriterService,
    private readonly attendance: AttendanceRepository,
    private readonly leave: LeaveRepository,
  ) {}

  private hasGrant(
    actingUserId: string,
    permissionKey: string,
    scope: PermissionScope,
  ): Promise<boolean> {
    return this.permissions.hasGrant(actingUserId, permissionKey, scope);
  }

  private async requireReview(
    actingUserId: string,
    permissionKey: string,
    employeeDepartmentId: string | null,
  ): Promise<void> {
    if (await this.hasGrant(actingUserId, permissionKey, "ORGANIZATION")) return;
    if (await this.hasGrant(actingUserId, permissionKey, "DEPARTMENT")) {
      const departmentId = await this.repository.findUserDepartmentId(actingUserId);
      if (departmentId && departmentId === employeeDepartmentId) return;
    }
    throw permissionDenied();
  }

  private async visibleDepartmentId(
    actingUserId: string,
    permissionKey: string,
  ): Promise<string | undefined> {
    if (await this.hasGrant(actingUserId, permissionKey, "ORGANIZATION")) {
      return undefined;
    }
    if (await this.hasGrant(actingUserId, permissionKey, "DEPARTMENT")) {
      const departmentId = await this.repository.findUserDepartmentId(actingUserId);
      if (departmentId) return departmentId;
    }
    throw permissionDenied();
  }

  /** Narrower than `visibleDepartmentId`: only Super Admin and the HR &
   * Executive Officer department's own manager may pass - no other
   * Department Manager, even for their own department. Mirrors
   * `EmployeesService.requireEmployeeAccess`'s exact shape. */
  private async requireHrOrSuperAdminAccess(
    actingUserId: string,
    permissionKey: string,
  ): Promise<void> {
    const context = await this.permissions.getAccessContext(actingUserId);
    if (context.role === "SUPER_ADMIN") {
      if (await this.hasGrant(actingUserId, permissionKey, "ORGANIZATION")) {
        return;
      }
      throw permissionDenied();
    }
    if (
      isHrExecutiveOfficerManager(context) &&
      (await this.hasGrant(actingUserId, permissionKey, "DEPARTMENT"))
    ) {
      return;
    }
    throw permissionDenied();
  }

  async listOvertime(
    actingUserId: string,
    status?: AttendanceOvertimeStatus,
  ): Promise<OvertimeApprovalResponse[]> {
    const departmentId = await this.visibleDepartmentId(actingUserId, OVERTIME_PERMISSION);
    const records = await this.repository.listOvertime({
      ...(status ? { status } : {}),
      ...(departmentId ? { departmentId } : {}),
    });
    return records.map(toOvertimeResponse);
  }

  async decideOvertime(
    actingUserId: string,
    id: string,
    dto: DecideOvertimeDto,
    requestId: string,
  ): Promise<OvertimeApprovalResponse> {
    const overtime = await this.repository.findOvertimeById(id);
    if (!overtime) throw attendanceOvertimeNotFound();
    if (overtime.employeeId === actingUserId) throw attendanceSelfApprovalForbidden();
    await this.requireReview(actingUserId, OVERTIME_PERMISSION, overtime.employeeDepartmentId);
    if (overtime.status !== AttendanceOvertimeStatus.PENDING) {
      throw attendanceOvertimeAlreadyDecided();
    }

    const record = await this.repository.decideOvertime(id, {
      status:
        dto.decision === "APPROVED"
          ? AttendanceOvertimeStatus.APPROVED
          : AttendanceOvertimeStatus.REJECTED,
      decidedById: actingUserId,
      ...(dto.decision === "APPROVED" ? { approvedMinutes: dto.approvedMinutes! } : {}),
      ...(dto.decisionReason !== undefined ? { decisionReason: dto.decisionReason } : {}),
    });
    await this.audit.record({
      action:
        dto.decision === "APPROVED" ? "attendance.overtime.approved" : "attendance.overtime.rejected",
      actorKind: AuditActorKind.USER,
      actorUserId: actingUserId,
      requestId,
      resourceType: "attendance_overtime_approval",
      resourceId: id,
      outcome: AuditOutcome.SUCCEEDED,
      metadata: { employeeId: overtime.employeeId },
    });
    return toOvertimeResponse(record);
  }

  async listExceptions(
    actingUserId: string,
    status?: AttendanceExceptionStatus,
  ): Promise<AttendanceExceptionResponse[]> {
    const departmentId = await this.visibleDepartmentId(actingUserId, EXCEPTION_PERMISSION);
    const records = await this.repository.listExceptions({
      ...(status ? { status } : {}),
      ...(departmentId ? { departmentId } : {}),
    });
    return records.map(toExceptionResponse);
  }

  async decideException(
    actingUserId: string,
    id: string,
    dto: DecideExceptionDto,
    requestId: string,
  ): Promise<AttendanceExceptionResponse> {
    const exception = await this.repository.findExceptionById(id);
    if (!exception) throw attendanceExceptionNotFound();
    if (exception.employeeId === actingUserId) throw attendanceSelfApprovalForbidden();
    await this.requireReview(actingUserId, EXCEPTION_PERMISSION, exception.employeeDepartmentId);
    if (exception.status !== AttendanceExceptionStatus.PENDING) {
      throw attendanceExceptionAlreadyDecided();
    }

    const record = await this.repository.decideException(id, {
      status:
        dto.decision === "APPROVED"
          ? AttendanceExceptionStatus.APPROVED
          : AttendanceExceptionStatus.REJECTED,
      reviewedById: actingUserId,
      ...(dto.reviewNote !== undefined ? { reviewNote: dto.reviewNote } : {}),
    });
    await this.audit.record({
      action:
        dto.decision === "APPROVED" ? "attendance.exception.approved" : "attendance.exception.rejected",
      actorKind: AuditActorKind.USER,
      actorUserId: actingUserId,
      requestId,
      resourceType: "attendance_exception",
      resourceId: id,
      outcome: AuditOutcome.SUCCEEDED,
      metadata: { employeeId: exception.employeeId },
    });
    return toExceptionResponse(record);
  }

  /**
   * Roster-driven: starts from every active employee in scope (so an
   * employee absent for the *entire* range still appears, instead of being
   * invisible because they have no session or leave row at all), plus
   * anyone outside that roster who still has a real session or leave record
   * in range (e.g. a since-deactivated employee - their historical record
   * is not hidden just because they are no longer active today).
   *
   * For each employee, each *working* day in the range (not OFF, not a
   * holiday - `AttendanceRepository.resolveWorkingDays`) is classified in a
   * fixed order so the categories are mutually exclusive by construction:
   * On-leave (an approved request covers it - checked first, so a day with
   * both a session and approved leave still counts as On-leave, never
   * Present) > Present (a session exists that date, any status including
   * `MISSING_CHECKOUT`) > Absent (neither). This guarantees `scheduledDays
   * === presentDays + absentDays + onLeaveDays` for every row. `Present` is
   * a check-in fact only, never evidence the scheduled hours were completed
   * - the existing `actualMinutes`/`lateMinutes`/overtime fields (computed
   * exactly as before, independent of this walk) are what answer that.
   */
  async summarize(
    actingUserId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<AttendanceSummaryResponse[]> {
    const departmentId = await this.visibleDepartmentId(actingUserId, REPORTS_PERMISSION);
    const scope = departmentId ? { departmentId } : {};
    const [minuteRows, leaveRequests, roster, presentDates, workingDays] =
      await Promise.all([
        this.repository.summarize({ startDate, endDate, ...scope }),
        this.leave.listApprovedInRange({ startDate, endDate, ...scope }),
        this.repository.listActiveEmployees(scope),
        this.repository.listPresentDates({ startDate, endDate, ...scope }),
        this.attendance.resolveWorkingDays(startDate, endDate),
      ]);

    const minutesByEmployee = new Map(
      minuteRows.map((row) => [row.employeeId, row]),
    );
    const namesByEmployee = new Map<string, string | null>();
    for (const employee of roster) namesByEmployee.set(employee.id, employee.name);
    for (const row of minuteRows) {
      if (!namesByEmployee.has(row.employeeId)) {
        namesByEmployee.set(row.employeeId, row.employeeName);
      }
    }
    const leaveDatesByEmployee = new Map<string, Set<string>>();
    for (const request of leaveRequests) {
      if (!namesByEmployee.has(request.employeeId)) {
        namesByEmployee.set(request.employeeId, request.employeeName);
      }
      const dates = leaveDatesByEmployee.get(request.employeeId) ?? new Set<string>();
      for (const iso of clippedIsoDates(
        request.startDate,
        request.endDate,
        startDate,
        endDate,
      )) {
        dates.add(iso);
      }
      leaveDatesByEmployee.set(request.employeeId, dates);
    }

    const workingDates = [...workingDays.keys()];

    const summaries: AttendanceSummaryResponse[] = [...namesByEmployee.keys()].map(
      (employeeId) => {
        const minuteRow = minutesByEmployee.get(employeeId);
        const presentSet = presentDates.get(employeeId) ?? new Set<string>();
        const leaveSet = leaveDatesByEmployee.get(employeeId) ?? new Set<string>();

        let scheduledDays = 0;
        let onLeaveDays = 0;
        let presentDays = 0;
        let absentDays = 0;
        for (const iso of workingDates) {
          scheduledDays += 1;
          if (leaveSet.has(iso)) onLeaveDays += 1;
          else if (presentSet.has(iso)) presentDays += 1;
          else absentDays += 1;
        }

        return {
          employeeId,
          employeeName: namesByEmployee.get(employeeId) ?? null,
          sessionsCount: minuteRow?.sessionsCount ?? 0,
          actualMinutes: minuteRow?.actualMinutes ?? 0,
          lateMinutes: minuteRow?.lateMinutes ?? 0,
          earlyDepartureMinutes: minuteRow?.earlyDepartureMinutes ?? 0,
          potentialOvertimeMinutes: minuteRow?.potentialOvertimeMinutes ?? 0,
          approvedOvertimeMinutes: minuteRow?.approvedOvertimeMinutes ?? 0,
          scheduledDays,
          presentDays,
          absentDays,
          onLeaveDays,
        };
      },
    );
    return summaries.sort((a, b) =>
      (a.employeeName ?? "").localeCompare(b.employeeName ?? ""),
    );
  }

  // -------------------------------------------------------------------
  // Work calendar (weekly schedule + holidays) - Super Admin and the HR &
  // Executive Officer department's own manager only, same boundary as
  // `listDetailedSessions` below.
  // -------------------------------------------------------------------

  async listWeekdaySchedule(
    actingUserId: string,
  ): Promise<AttendanceWeekdayScheduleResponse[]> {
    await this.requireHrOrSuperAdminAccess(actingUserId, CALENDAR_PERMISSION);
    const rows = await this.attendance.listWeekdaySchedule();
    return rows.map(toWeekdayScheduleResponse);
  }

  async createWeekdaySchedule(
    actingUserId: string,
    dto: CreateWeekdayScheduleDto,
    requestId: string,
  ): Promise<AttendanceWeekdayScheduleResponse> {
    await this.requireHrOrSuperAdminAccess(actingUserId, CALENDAR_PERMISSION);
    const result = await this.attendance.createWeekdaySchedule({
      dayOfWeek: dto.dayOfWeek,
      type: dto.type,
      effectiveFrom: new Date(dto.effectiveFrom),
      createdById: actingUserId,
    });
    if (result === "already_effective") throw attendanceWeekdayScheduleConflict();
    await this.audit.record({
      action: "attendance.calendar.weekday_updated",
      actorKind: AuditActorKind.USER,
      actorUserId: actingUserId,
      requestId,
      resourceType: "attendance_weekday_schedule",
      resourceId: `${dto.dayOfWeek}:${dto.effectiveFrom}`,
      outcome: AuditOutcome.SUCCEEDED,
      metadata: { dayOfWeek: dto.dayOfWeek, type: dto.type, effectiveFrom: dto.effectiveFrom },
    });
    return toWeekdayScheduleResponse(result);
  }

  async listHolidays(actingUserId: string): Promise<AttendanceHolidayResponse[]> {
    await this.requireHrOrSuperAdminAccess(actingUserId, CALENDAR_PERMISSION);
    const rows = await this.attendance.listHolidays();
    return rows.map(toHolidayResponse);
  }

  async createHoliday(
    actingUserId: string,
    dto: CreateHolidayDto,
    requestId: string,
  ): Promise<AttendanceHolidayResponse> {
    await this.requireHrOrSuperAdminAccess(actingUserId, CALENDAR_PERMISSION);
    const result = await this.attendance.createHoliday({
      date: new Date(dto.date),
      name: dto.name.trim(),
      createdById: actingUserId,
    });
    if (result === "date_taken") throw attendanceHolidayDateTaken();
    await this.audit.record({
      action: "attendance.calendar.holiday_created",
      actorKind: AuditActorKind.USER,
      actorUserId: actingUserId,
      requestId,
      resourceType: "attendance_holiday",
      resourceId: result.id,
      outcome: AuditOutcome.SUCCEEDED,
      metadata: { date: dto.date, name: dto.name },
    });
    return toHolidayResponse(result);
  }

  async updateHoliday(
    actingUserId: string,
    id: string,
    dto: UpdateHolidayDto,
    requestId: string,
  ): Promise<AttendanceHolidayResponse> {
    await this.requireHrOrSuperAdminAccess(actingUserId, CALENDAR_PERMISSION);
    const result = await this.attendance.updateHoliday(id, {
      ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
    });
    if (result === "not_found") throw attendanceHolidayNotFound();
    if (result === "date_taken") throw attendanceHolidayDateTaken();
    await this.audit.record({
      action: "attendance.calendar.holiday_updated",
      actorKind: AuditActorKind.USER,
      actorUserId: actingUserId,
      requestId,
      resourceType: "attendance_holiday",
      resourceId: id,
      outcome: AuditOutcome.SUCCEEDED,
    });
    return toHolidayResponse(result);
  }

  async removeHoliday(
    actingUserId: string,
    id: string,
    requestId: string,
  ): Promise<void> {
    await this.requireHrOrSuperAdminAccess(actingUserId, CALENDAR_PERMISSION);
    const removed = await this.attendance.removeHoliday(id);
    if (!removed) throw attendanceHolidayNotFound();
    await this.audit.record({
      action: "attendance.calendar.holiday_removed",
      actorKind: AuditActorKind.USER,
      actorUserId: actingUserId,
      requestId,
      resourceType: "attendance_holiday",
      resourceId: id,
      outcome: AuditOutcome.SUCCEEDED,
    });
  }

  /** Every individual check-in/check-out across the whole organization in a
   * date range, optionally narrowed to one employee - visible only to
   * Super Admin and the HR & Executive Officer department's manager (see
   * `requireHrOrSuperAdminAccess`), unlike `summarize()` above which stays
   * open to every Department Manager for their own department. */
  async listDetailedSessions(
    actingUserId: string,
    startDate: Date,
    endDate: Date,
    employeeId?: string,
  ): Promise<AttendanceSessionResponse[]> {
    await this.requireHrOrSuperAdminAccess(actingUserId, REPORTS_PERMISSION);
    const sessions = await this.attendance.listSessions({
      startDate,
      endDate,
      ...(employeeId ? { employeeId } : {}),
    });
    return sessions.map(toAttendanceSessionResponse);
  }
}
