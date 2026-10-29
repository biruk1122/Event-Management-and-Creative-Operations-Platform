import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../../../database/database.service.js";
import {
  AttendanceExceptionStatus,
  AttendanceExceptionType,
  AttendanceOvertimeStatus,
  OutboxActorKind,
  UserAccountStatus,
} from "../../../generated/prisma/client.js";
import { OutboxWriterService } from "../../../outbox/outbox-writer.service.js";
import type {
  AttendanceExceptionDecidedEventPayload,
  AttendanceOvertimeDecidedEventPayload,
} from "../../../outbox/outbox.types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID.test(value);
}

function personName(
  person: { firstName: string | null; lastName: string | null; email: string } | null,
): string | null {
  if (!person) return null;
  const name = [person.firstName, person.lastName]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  return name.length > 0 ? name : person.email;
}

export interface AttendanceSummaryRow {
  employeeId: string;
  employeeName: string | null;
  sessionsCount: number;
  actualMinutes: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  potentialOvertimeMinutes: number;
  approvedOvertimeMinutes: number;
}

export interface OvertimeApprovalRecord {
  id: string;
  attendanceSessionId: string;
  employeeId: string;
  employeeName: string | null;
  employeeDepartmentId: string | null;
  sessionDate: Date;
  potentialMinutes: number;
  requestedReason: string | null;
  status: AttendanceOvertimeStatus;
  approvedMinutes: number | null;
  decisionReason: string | null;
  decidedByName: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}

export interface ExceptionRecord {
  id: string;
  attendanceSessionId: string | null;
  employeeId: string;
  employeeName: string | null;
  employeeDepartmentId: string | null;
  type: AttendanceExceptionType;
  description: string | null;
  requestedCheckInAt: Date | null;
  requestedCheckOutAt: Date | null;
  status: AttendanceExceptionStatus;
  reviewNote: string | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

const OVERTIME_SELECT = {
  id: true,
  attendanceSessionId: true,
  potentialMinutes: true,
  requestedReason: true,
  status: true,
  approvedMinutes: true,
  decisionReason: true,
  decidedAt: true,
  createdAt: true,
  decidedBy: { select: { firstName: true, lastName: true, email: true } },
  session: {
    select: {
      employeeId: true,
      sessionDate: true,
      employee: {
        select: { departmentId: true, firstName: true, lastName: true, email: true },
      },
    },
  },
} as const;

type RawOvertime = {
  id: string;
  attendanceSessionId: string;
  potentialMinutes: number;
  requestedReason: string | null;
  status: AttendanceOvertimeStatus;
  approvedMinutes: number | null;
  decisionReason: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  decidedBy: { firstName: string | null; lastName: string | null; email: string } | null;
  session: {
    employeeId: string;
    sessionDate: Date;
    employee: {
      departmentId: string | null;
      firstName: string | null;
      lastName: string | null;
      email: string;
    };
  };
};

function toOvertimeRecord(raw: RawOvertime): OvertimeApprovalRecord {
  return {
    id: raw.id,
    attendanceSessionId: raw.attendanceSessionId,
    employeeId: raw.session.employeeId,
    employeeName: personName(raw.session.employee),
    employeeDepartmentId: raw.session.employee.departmentId,
    sessionDate: raw.session.sessionDate,
    potentialMinutes: raw.potentialMinutes,
    requestedReason: raw.requestedReason,
    status: raw.status,
    approvedMinutes: raw.approvedMinutes,
    decisionReason: raw.decisionReason,
    decidedByName: personName(raw.decidedBy),
    decidedAt: raw.decidedAt,
    createdAt: raw.createdAt,
  };
}

const EXCEPTION_SELECT = {
  id: true,
  attendanceSessionId: true,
  type: true,
  description: true,
  requestedCheckInAt: true,
  requestedCheckOutAt: true,
  status: true,
  reviewNote: true,
  reviewedAt: true,
  createdAt: true,
  employee: {
    select: { id: true, departmentId: true, firstName: true, lastName: true, email: true },
  },
  reviewedBy: { select: { firstName: true, lastName: true, email: true } },
} as const;

type RawException = {
  id: string;
  attendanceSessionId: string | null;
  type: AttendanceExceptionType;
  description: string | null;
  requestedCheckInAt: Date | null;
  requestedCheckOutAt: Date | null;
  status: AttendanceExceptionStatus;
  reviewNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  employee: {
    id: string;
    departmentId: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  reviewedBy: { firstName: string | null; lastName: string | null; email: string } | null;
};

function toExceptionRecord(raw: RawException): ExceptionRecord {
  return {
    id: raw.id,
    attendanceSessionId: raw.attendanceSessionId,
    employeeId: raw.employee.id,
    employeeName: personName(raw.employee),
    employeeDepartmentId: raw.employee.departmentId,
    type: raw.type,
    description: raw.description,
    requestedCheckInAt: raw.requestedCheckInAt,
    requestedCheckOutAt: raw.requestedCheckOutAt,
    status: raw.status,
    reviewNote: raw.reviewNote,
    reviewedByName: personName(raw.reviewedBy),
    reviewedAt: raw.reviewedAt,
    createdAt: raw.createdAt,
  };
}

@Injectable()
export class AttendanceReviewRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxWriterService,
  ) {}

  async findUserDepartmentId(userId: string): Promise<string | null> {
    if (!isUuid(userId)) return null;
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    return user?.departmentId ?? null;
  }

  async findOvertimeById(id: string): Promise<OvertimeApprovalRecord | null> {
    if (!isUuid(id)) return null;
    const raw = await this.db.attendanceOvertimeApproval.findUnique({
      where: { id },
      select: OVERTIME_SELECT,
    });
    return raw ? toOvertimeRecord(raw) : null;
  }

  async listOvertime(input: {
    status?: AttendanceOvertimeStatus;
    departmentId?: string;
  }): Promise<OvertimeApprovalRecord[]> {
    const rows = await this.db.attendanceOvertimeApproval.findMany({
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.departmentId
          ? { session: { employee: { departmentId: input.departmentId } } }
          : {}),
      },
      select: OVERTIME_SELECT,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toOvertimeRecord);
  }

  async decideOvertime(
    id: string,
    input: {
      status: AttendanceOvertimeStatus;
      approvedMinutes?: number;
      decisionReason?: string;
      decidedById: string;
    },
  ): Promise<OvertimeApprovalRecord> {
    const raw = await this.db.attendanceOvertimeApproval.update({
      where: { id },
      data: {
        status: input.status,
        decidedAt: new Date(),
        decidedById: input.decidedById,
        approvedMinutes: input.approvedMinutes ?? null,
        decisionReason: input.decisionReason ?? null,
      },
      select: OVERTIME_SELECT,
    });
    const record = toOvertimeRecord(raw);
    await this.outbox.record({
      name: "attendance.overtime.decided",
      version: 1,
      actorKind: OutboxActorKind.USER,
      actorUserId: input.decidedById,
      resourceType: "attendance_overtime_approval",
      resourceId: id,
      payload: { employeeId: record.employeeId } satisfies AttendanceOvertimeDecidedEventPayload,
      consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
    });
    return record;
  }

  async findExceptionById(id: string): Promise<ExceptionRecord | null> {
    if (!isUuid(id)) return null;
    const raw = await this.db.attendanceException.findUnique({
      where: { id },
      select: EXCEPTION_SELECT,
    });
    return raw ? toExceptionRecord(raw) : null;
  }

  async listExceptions(input: {
    status?: AttendanceExceptionStatus;
    departmentId?: string;
  }): Promise<ExceptionRecord[]> {
    const rows = await this.db.attendanceException.findMany({
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.departmentId
          ? { employee: { departmentId: input.departmentId } }
          : {}),
      },
      select: EXCEPTION_SELECT,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toExceptionRecord);
  }

  async decideException(
    id: string,
    input: {
      status: AttendanceExceptionStatus;
      reviewNote?: string;
      reviewedById: string;
    },
  ): Promise<ExceptionRecord> {
    const raw = await this.db.attendanceException.update({
      where: { id },
      data: {
        status: input.status,
        reviewedAt: new Date(),
        reviewedById: input.reviewedById,
        reviewNote: input.reviewNote ?? null,
      },
      select: EXCEPTION_SELECT,
    });
    const record = toExceptionRecord(raw);
    await this.outbox.record({
      name: "attendance.exception.decided",
      version: 1,
      actorKind: OutboxActorKind.USER,
      actorUserId: input.reviewedById,
      resourceType: "attendance_exception",
      resourceId: id,
      payload: { employeeId: record.employeeId } satisfies AttendanceExceptionDecidedEventPayload,
      consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
    });
    return record;
  }

  // -------------------------------------------------------------------
  // Reporting
  // -------------------------------------------------------------------

  /**
   * Per-employee attendance totals over a date range - server-computed
   * from the same `AttendanceSession` snapshots every other view reads,
   * never recomputed from raw punches here. Approved overtime is summed
   * separately from potential overtime, matching the "never conflate
   * potential with approved" rule the schema itself enforces.
   */
  async summarize(input: {
    startDate: Date;
    endDate: Date;
    departmentId?: string;
  }): Promise<AttendanceSummaryRow[]> {
    const sessions = await this.db.attendanceSession.findMany({
      where: {
        sessionDate: { gte: input.startDate, lte: input.endDate },
        ...(input.departmentId
          ? { employee: { departmentId: input.departmentId } }
          : {}),
      },
      select: {
        employeeId: true,
        employee: { select: { firstName: true, lastName: true, email: true } },
        actualMinutes: true,
        lateMinutes: true,
        earlyDepartureMinutes: true,
        potentialOvertimeMinutes: true,
        overtime: { select: { status: true, approvedMinutes: true } },
      },
    });

    const byEmployee = new Map<string, AttendanceSummaryRow>();
    for (const session of sessions) {
      const existing = byEmployee.get(session.employeeId) ?? {
        employeeId: session.employeeId,
        employeeName: personName(session.employee),
        sessionsCount: 0,
        actualMinutes: 0,
        lateMinutes: 0,
        earlyDepartureMinutes: 0,
        potentialOvertimeMinutes: 0,
        approvedOvertimeMinutes: 0,
      };
      existing.sessionsCount += 1;
      existing.actualMinutes += session.actualMinutes ?? 0;
      existing.lateMinutes += session.lateMinutes;
      existing.earlyDepartureMinutes += session.earlyDepartureMinutes;
      existing.potentialOvertimeMinutes += session.potentialOvertimeMinutes;
      if (session.overtime?.status === "APPROVED") {
        existing.approvedOvertimeMinutes += session.overtime.approvedMinutes ?? 0;
      }
      byEmployee.set(session.employeeId, existing);
    }
    return [...byEmployee.values()].sort((a, b) =>
      (a.employeeName ?? "").localeCompare(b.employeeName ?? ""),
    );
  }

  /** Distinct employee + session-date pairs in range - the "did this
   * employee have a session on this specific day" lookup the roster-driven
   * Present/Absent walk needs, kept as its own query rather than folded into
   * `summarize()`'s minute-aggregation above so neither can destabilize the
   * other. */
  async listPresentDates(input: {
    startDate: Date;
    endDate: Date;
    departmentId?: string;
  }): Promise<Map<string, Set<string>>> {
    const rows = await this.db.attendanceSession.findMany({
      where: {
        sessionDate: { gte: input.startDate, lte: input.endDate },
        ...(input.departmentId
          ? { employee: { departmentId: input.departmentId } }
          : {}),
      },
      select: { employeeId: true, sessionDate: true },
      distinct: ["employeeId", "sessionDate"],
    });
    const byEmployee = new Map<string, Set<string>>();
    for (const row of rows) {
      const iso = row.sessionDate.toISOString().slice(0, 10);
      const dates = byEmployee.get(row.employeeId) ?? new Set<string>();
      dates.add(iso);
      byEmployee.set(row.employeeId, dates);
    }
    return byEmployee;
  }

  /** Active employees in scope, mirroring `PartnersRepository.listEligibleOwners`'s
   * exact shape - `summarize()` starts from this roster so an employee
   * absent for the *entire* requested range still appears (today they are
   * invisible, since the report is built only from sessions/leave rows). */
  async listActiveEmployees(input: {
    departmentId?: string;
  }): Promise<{ id: string; name: string | null }[]> {
    const rows = await this.db.user.findMany({
      where: {
        status: UserAccountStatus.ACTIVE,
        ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    return rows.map((row) => ({ id: row.id, name: personName(row) }));
  }
}
