import { ApiProperty } from "@nestjs/swagger";

/** A user attached to a team, as manager or as a member. */
export class TeamUserSummary {
  @ApiProperty({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  })
  id!: string;

  @ApiProperty({ format: "email", example: "dana.okafor@example.com" })
  email!: string;

  @ApiProperty({ type: String, nullable: true, example: "Dana" })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true, example: "Okafor" })
  lastName!: string | null;
}

/** The department a team belongs to. Every team is department-owned. */
export class TeamDepartmentSummary {
  @ApiProperty({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  })
  id!: string;

  @ApiProperty({ example: "Production" })
  name!: string;
}

/**
 * Public view of a team and its composition. `deactivatedAt` is the
 * safe-deactivation marker (null means active); teams carry no SRS status
 * field. "Active projects/events" from SRS 5.4 are derived summaries a later
 * slice adds once those modules exist, and team-to-work assignment is out of
 * scope here.
 */
export class TeamResponse {
  @ApiProperty({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  })
  id!: string;

  @ApiProperty({ example: "Production Team" })
  name!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: "Delivers production for events and campaigns.",
  })
  description!: string | null;

  @ApiProperty({ type: TeamDepartmentSummary })
  department!: TeamDepartmentSummary;

  @ApiProperty({
    type: TeamUserSummary,
    nullable: true,
    description: "Null when no manager is assigned.",
  })
  manager!: TeamUserSummary | null;

  @ApiProperty({
    type: [TeamUserSummary],
    description: "The users who belong to this team.",
  })
  members!: TeamUserSummary[];

  @ApiProperty({
    type: String,
    format: "date-time",
    nullable: true,
    description: "Set while the team is deactivated; null when active.",
  })
  deactivatedAt!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

/** A page of teams for the administration list. */
export class PaginatedTeamsResponse {
  @ApiProperty({ type: [TeamResponse] })
  items!: TeamResponse[];

  @ApiProperty({ example: 1, description: "1-based page number." })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({ example: 7, description: "Total teams matching the filter." })
  total!: number;
}
