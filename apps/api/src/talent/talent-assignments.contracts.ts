import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class TalentAssignmentPersonResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ nullable: true, type: String })
  firstName!: string | null;

  @ApiProperty({ nullable: true, type: String })
  lastName!: string | null;
}

/** One assignment of a talent to an event, production, or promotional activity. */
export class TalentAssignmentResponse {
  @ApiProperty({ enum: ["EVENT", "PRODUCTION", "PROMOTION"] })
  kind!: "EVENT" | "PRODUCTION" | "PROMOTION";

  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  workId!: string;

  @ApiProperty()
  workName!: string;

  @ApiProperty({ format: "uuid", nullable: true, type: String })
  departmentId!: string | null;

  @ApiProperty()
  role!: string;

  @ApiProperty({ enum: ["ASSIGNED", "COMPLETED", "CANCELLED"] })
  status!: "ASSIGNED" | "COMPLETED" | "CANCELLED";

  @ApiProperty({ enum: ["upcoming", "active", "completed", "cancelled"] })
  phase!: "upcoming" | "active" | "completed" | "cancelled";

  @ApiProperty({ nullable: true, type: String })
  notes!: string | null;

  @ApiProperty({ format: "date-time", nullable: true, type: String })
  startAt!: string | null;

  @ApiProperty({ format: "date-time", nullable: true, type: String })
  endAt!: string | null;

  @ApiProperty({ format: "date-time" })
  assignedAt!: string;

  @ApiProperty({ format: "date-time", nullable: true, type: String })
  completedAt!: string | null;

  @ApiProperty({ format: "date-time", nullable: true, type: String })
  cancelledAt!: string | null;

  @ApiProperty({ nullable: true, type: String })
  cancelReason!: string | null;

  @ApiProperty({ type: TalentAssignmentPersonResponse, nullable: true })
  assignedBy!: TalentAssignmentPersonResponse | null;

  @ApiProperty({ type: TalentAssignmentPersonResponse, nullable: true })
  cancelledBy!: TalentAssignmentPersonResponse | null;
}

/** A schedule conflict the server found. Fields depend on `type`. */
export class TalentAssignmentConflictResponse {
  @ApiProperty({
    enum: ["UNAVAILABLE", "ASSIGNMENT_OVERLAP", "SCHEDULE_OVERLAP"],
  })
  type!: "UNAVAILABLE" | "ASSIGNMENT_OVERLAP" | "SCHEDULE_OVERLAP";

  @ApiPropertyOptional({ enum: ["EVENT", "PRODUCTION", "PROMOTION"] })
  assignmentKind?: "EVENT" | "PRODUCTION" | "PROMOTION";

  @ApiPropertyOptional({ format: "uuid" })
  assignmentId?: string;

  @ApiPropertyOptional()
  title?: string;

  @ApiPropertyOptional({ format: "date-time" })
  startAt?: string;

  @ApiPropertyOptional({ format: "date-time", nullable: true, type: String })
  endAt?: string | null;

  @ApiPropertyOptional({ format: "uuid" })
  scheduleId?: string;
}

export class TalentAssignmentCheckResponse {
  @ApiProperty({
    description: "True when the talent is inactive and cannot be assigned.",
  })
  blocked!: boolean;

  @ApiProperty({
    description:
      "True when the talent already has an active assignment for this work.",
  })
  duplicate!: boolean;

  @ApiProperty({ type: [TalentAssignmentConflictResponse] })
  conflicts!: TalentAssignmentConflictResponse[];
}

export class TalentWorkOptionResponse {
  @ApiProperty({ enum: ["EVENT", "PRODUCTION", "PROMOTION"] })
  kind!: "EVENT" | "PRODUCTION" | "PROMOTION";

  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ format: "date-time", nullable: true, type: String })
  startAt!: string | null;

  @ApiProperty({ format: "date-time", nullable: true, type: String })
  endAt!: string | null;

  @ApiProperty({ format: "uuid", nullable: true, type: String })
  departmentId!: string | null;
}

export class TalentActivityResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  type!: string;

  @ApiProperty({
    enum: ["EVENT", "PRODUCTION", "PROMOTION"],
    nullable: true,
    type: String,
  })
  assignmentKind!: string | null;

  @ApiProperty({ format: "uuid", nullable: true, type: String })
  assignmentId!: string | null;

  @ApiProperty({
    description: "Details recorded with the change; the shape depends on type.",
    type: "object",
    additionalProperties: true,
  })
  details!: unknown;

  @ApiProperty({ format: "date-time" })
  occurredAt!: string;

  @ApiProperty({ type: TalentAssignmentPersonResponse, nullable: true })
  actor!: TalentAssignmentPersonResponse | null;
}
