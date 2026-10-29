import { ApiProperty } from "@nestjs/swagger";

import { LeaveRequestStatus } from "../generated/prisma/client.js";

export class LeaveGrantResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  employeeId!: string;

  @ApiProperty({ format: "uuid" })
  leaveTypeId!: string;

  @ApiProperty()
  leaveTypeName!: string;

  @ApiProperty()
  grantedDays!: number;

  @ApiProperty({ description: "Current remaining balance for this grant alone." })
  remaining!: number;

  @ApiProperty({ format: "date-time" })
  grantedAt!: string;

  @ApiProperty({ format: "date-time", description: "Exactly two years after grantedAt." })
  expiresAt!: string;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}

export class LeaveBalanceResponse {
  @ApiProperty({ format: "uuid" })
  leaveTypeId!: string;

  @ApiProperty({ description: "Sum of every non-expired grant's own remaining balance." })
  totalRemaining!: number;

  @ApiProperty({ type: [LeaveGrantResponse] })
  grants!: LeaveGrantResponse[];
}

export class LeaveRequestResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  employeeId!: string;

  @ApiProperty({ type: String, nullable: true })
  employeeName!: string | null;

  @ApiProperty({ format: "uuid" })
  leaveTypeId!: string;

  @ApiProperty()
  leaveTypeName!: string;

  @ApiProperty({ type: String, format: "date" })
  startDate!: string;

  @ApiProperty({ type: String, format: "date" })
  endDate!: string;

  @ApiProperty()
  daysRequested!: number;

  @ApiProperty({ type: String, nullable: true })
  reason!: string | null;

  @ApiProperty({ enum: LeaveRequestStatus })
  status!: LeaveRequestStatus;

  @ApiProperty({ type: String, nullable: true })
  reviewedByName!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  reviewedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  reviewNote!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}
