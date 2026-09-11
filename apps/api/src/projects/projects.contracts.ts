import { ApiProperty } from "@nestjs/swagger";

import { ProjectStatus } from "../generated/prisma/client.js";

/** A user attached to a project through its connected workspace, or its author. */
export class ProjectPersonSummary {
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

/** A team assigned to a project through its connected workspace. */
export class ProjectTeamSummary {
  @ApiProperty({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  })
  id!: string;

  @ApiProperty({ example: "Production Team" })
  name!: string;
}

/**
 * Public view of a general project and its connected workspace overview: the
 * shared operational context (the project manager, the assigned teams, and the
 * assigned employees) is read from the project's `Workspace` (WSP-01), never
 * re-modelled here. There is no budget field - it is out of scope for general
 * projects (unlike events) - and no type field, since Production Management's
 * projects are a distinct model owned by the PRD epic. Progress is not part of
 * this contract: it must be computed from authoritative work (tasks), which
 * Task Management does not yet provide (OD-03).
 */
export class ProjectResponse {
  @ApiProperty({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  })
  id!: string;

  @ApiProperty({
    format: "uuid",
    description:
      "The connected workspace that anchors this project's manager, teams, and participants.",
  })
  workspaceId!: string;

  @ApiProperty({ example: "Brand Refresh" })
  name!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: "Redesign the visual identity.",
  })
  description!: string | null;

  @ApiProperty({ enum: ProjectStatus, description: "Current lifecycle state." })
  status!: ProjectStatus;

  @ApiProperty({
    type: String,
    format: "date-time",
    nullable: true,
    description: "UTC start. Null while the project is not yet scheduled.",
  })
  startAt!: string | null;

  @ApiProperty({
    type: String,
    format: "date-time",
    nullable: true,
    description: "UTC end. Never before the start when both are set.",
  })
  endAt!: string | null;

  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description:
      "The event this project optionally relates to. A soft cross-reference, not ownership.",
  })
  eventId!: string | null;

  @ApiProperty({
    type: ProjectPersonSummary,
    nullable: true,
    description: "The project manager, from the connected workspace.",
  })
  manager!: ProjectPersonSummary | null;

  @ApiProperty({
    type: [ProjectTeamSummary],
    description:
      "Teams assigned to this project, from the connected workspace.",
  })
  teams!: ProjectTeamSummary[];

  @ApiProperty({
    type: [ProjectPersonSummary],
    description:
      "Employees assigned to this project individually, from the connected workspace.",
  })
  participants!: ProjectPersonSummary[];

  @ApiProperty({
    type: ProjectPersonSummary,
    nullable: true,
    description:
      "The user who created the project; null once that user is gone.",
  })
  createdBy!: ProjectPersonSummary | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

/** A page of projects for the administration and connected-workspace overview. */
export class PaginatedProjectsResponse {
  @ApiProperty({ type: [ProjectResponse] })
  items!: ProjectResponse[];

  @ApiProperty({ example: 1, description: "1-based page number." })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({
    example: 7,
    description: "Total projects matching the filter.",
  })
  total!: number;
}
