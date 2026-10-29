import { ApiProperty } from "@nestjs/swagger";

import {
  AttendanceMethod,
  AttendanceSessionStatus,
} from "../generated/prisma/client.js";

export class AttendanceSessionResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  employeeId!: string;

  @ApiProperty({ type: String, nullable: true })
  employeeName!: string | null;

  @ApiProperty({ enum: AttendanceMethod })
  method!: AttendanceMethod;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  kioskId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  kioskName!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  eventShiftId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  eventName!: string | null;

  @ApiProperty({ type: String, format: "date" })
  sessionDate!: string;

  @ApiProperty({ format: "date-time" })
  checkInAt!: string;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  checkOutAt!: string | null;

  @ApiProperty({ enum: AttendanceSessionStatus })
  status!: AttendanceSessionStatus;

  @ApiProperty({ type: Number, nullable: true })
  scheduledMinutes!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  actualMinutes!: number | null;

  @ApiProperty()
  breakMinutes!: number;

  @ApiProperty({ type: Number, nullable: true })
  netMinutes!: number | null;

  @ApiProperty()
  lateMinutes!: number;

  @ApiProperty()
  earlyDepartureMinutes!: number;

  @ApiProperty()
  potentialOvertimeMinutes!: number;
}

export class PaginatedAttendanceSessionsResponse {
  @ApiProperty({ type: [AttendanceSessionResponse] })
  items!: AttendanceSessionResponse[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({ example: 7 })
  total!: number;
}
