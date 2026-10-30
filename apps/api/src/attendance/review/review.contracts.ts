import { ApiProperty } from "@nestjs/swagger";

import {
  AttendanceDayType,
  AttendanceExceptionStatus,
  AttendanceExceptionType,
  AttendanceOvertimeStatus,
} from "../../generated/prisma/client.js";

export class AttendanceSummaryResponse {
  @ApiProperty({ format: "uuid" })
  employeeId!: string;

  @ApiProperty({ type: String, nullable: true })
  employeeName!: string | null;

  @ApiProperty()
  sessionsCount!: number;

  @ApiProperty()
  actualMinutes!: number;

  @ApiProperty()
  lateMinutes!: number;

  @ApiProperty()
  earlyDepartureMinutes!: number;

  @ApiProperty()
  potentialOvertimeMinutes!: number;

  @ApiProperty()
  approvedOvertimeMinutes!: number;

  @ApiProperty({
    description:
      "Working days (not OFF, not a holiday) within the report's date range. scheduledDays === presentDays + absentDays + onLeaveDays always holds.",
  })
  scheduledDays!: number;

  @ApiProperty({
    description:
      "Scheduled days with at least one attendance session (any status) and no approved leave that day. A check-in fact only - not evidence the expected hours were completed.",
  })
  presentDays!: number;

  @ApiProperty({
    description:
      "Scheduled days with no attendance session and no approved leave.",
  })
  absentDays!: number;

  @ApiProperty({
    description:
      "Scheduled days covered by an approved leave request (checked before Present, so a day with both a session and approved leave counts here).",
  })
  onLeaveDays!: number;
}

export class AttendanceWeekdayScheduleResponse {
  @ApiProperty({ description: "0 = Sunday .. 6 = Saturday." })
  dayOfWeek!: number;

  @ApiProperty()
  dayName!: string;

  @ApiProperty({ enum: AttendanceDayType })
  type!: AttendanceDayType;

  @ApiProperty({ type: String, format: "date" })
  effectiveFrom!: string;
}

export class AttendanceHolidayResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, format: "date" })
  date!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  createdByName!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}

export class OvertimeApprovalResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  attendanceSessionId!: string;

  @ApiProperty({ format: "uuid" })
  employeeId!: string;

  @ApiProperty({ type: String, nullable: true })
  employeeName!: string | null;

  @ApiProperty({ type: String, format: "date" })
  sessionDate!: string;

  @ApiProperty()
  potentialMinutes!: number;

  @ApiProperty({ type: String, nullable: true })
  requestedReason!: string | null;

  @ApiProperty({ enum: AttendanceOvertimeStatus })
  status!: AttendanceOvertimeStatus;

  @ApiProperty({ type: Number, nullable: true })
  approvedMinutes!: number | null;

  @ApiProperty({ type: String, nullable: true })
  decisionReason!: string | null;

  @ApiProperty({ type: String, nullable: true })
  decidedByName!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  decidedAt!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}

export class AttendanceExceptionResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  attendanceSessionId!: string | null;

  @ApiProperty({ format: "uuid" })
  employeeId!: string;

  @ApiProperty({ type: String, nullable: true })
  employeeName!: string | null;

  @ApiProperty({ enum: AttendanceExceptionType })
  type!: AttendanceExceptionType;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  requestedCheckInAt!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  requestedCheckOutAt!: string | null;

  @ApiProperty({ enum: AttendanceExceptionStatus })
  status!: AttendanceExceptionStatus;

  @ApiProperty({ type: String, nullable: true })
  reviewNote!: string | null;

  @ApiProperty({ type: String, nullable: true })
  reviewedByName!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  reviewedAt!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}
