import { ApiProperty } from "@nestjs/swagger";

import { EventPersonSummary } from "./events.contracts.js";

/** A team assigned to an event. Members are empty unless `membersVisible` is true. */
export class EventTeamResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Event Team" })
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      name: { type: "string" },
    },
  })
  department!: { id: string; name: string };

  @ApiProperty({ type: () => EventPersonSummary, nullable: true })
  manager!: EventPersonSummary | null;

  @ApiProperty({
    description:
      "True when the caller may read this team's people (team.read organization-wide, or the team's own department).",
  })
  membersVisible!: boolean;

  @ApiProperty({ type: () => [EventPersonSummary] })
  members!: EventPersonSummary[];
}

/** A staff member named on an assignment. Display name only, never an email. */
export class EventStaffNameResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Dana Okafor" })
  displayName!: string;
}

/** The talent summary on an event assignment: never contact details. */
export class EventTalentSummaryResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Ada Bell" })
  fullName!: string;

  @ApiProperty({ example: "ARTIST" })
  type!: string;

  @ApiProperty({ example: "AVAILABLE" })
  availability!: string;
}

/**
 * An assignment seen from an event. The same record as the talent profile, but
 * staff are named by display name only, so no staff email leaves this surface.
 */
export class EventTalentAssignmentResponse {
  @ApiProperty({ enum: ["EVENT", "PRODUCTION", "PROMOTION"] })
  kind!: "EVENT" | "PRODUCTION" | "PROMOTION";

  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  workId!: string;

  @ApiProperty()
  workName!: string;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  departmentId!: string | null;

  @ApiProperty({ example: "Headliner" })
  role!: string;

  @ApiProperty({ enum: ["ASSIGNED", "COMPLETED", "CANCELLED"] })
  status!: "ASSIGNED" | "COMPLETED" | "CANCELLED";

  @ApiProperty({ enum: ["upcoming", "active", "completed", "cancelled"] })
  phase!: "upcoming" | "active" | "completed" | "cancelled";

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  startAt!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  endAt!: string | null;

  @ApiProperty({ format: "date-time" })
  assignedAt!: string;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  completedAt!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  cancelledAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  cancelReason!: string | null;

  @ApiProperty({ type: () => EventStaffNameResponse, nullable: true })
  assignedBy!: EventStaffNameResponse | null;

  @ApiProperty({ type: () => EventStaffNameResponse, nullable: true })
  cancelledBy!: EventStaffNameResponse | null;

  @ApiProperty({ type: () => EventTalentSummaryResponse })
  talent!: EventTalentSummaryResponse;
}
