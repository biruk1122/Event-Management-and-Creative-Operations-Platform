import { ApiProperty } from "@nestjs/swagger";

import { WorkspaceKind } from "../generated/prisma/client.js";

/** A user attached to a workspace, as manager or as a participant. */
export class WorkspaceUserSummary {
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

/** A team assigned to a workspace. */
export class WorkspaceTeamSummary {
  @ApiProperty({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  })
  id!: string;

  @ApiProperty({ example: "Production Team" })
  name!: string;
}

/**
 * Public view of a connected workspace root and its shared ownership: the
 * managing user, the assigned teams, and the individual participants. The
 * owning module record (event, project, or campaign) and the operational
 * records it connects are not part of this contract; they stay owned by their
 * modules and are delivered by later epics.
 */
export class WorkspaceResponse {
  @ApiProperty({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  })
  id!: string;

  @ApiProperty({
    enum: WorkspaceKind,
    description:
      "Which module owns this workspace. Fixed when the workspace is created.",
  })
  kind!: WorkspaceKind;

  @ApiProperty({
    type: WorkspaceUserSummary,
    nullable: true,
    description: "Null when no manager is assigned.",
  })
  manager!: WorkspaceUserSummary | null;

  @ApiProperty({
    type: [WorkspaceTeamSummary],
    description: "Teams assigned to this workspace.",
  })
  teams!: WorkspaceTeamSummary[];

  @ApiProperty({
    type: [WorkspaceUserSummary],
    description: "Users participating in this workspace individually.",
  })
  participants!: WorkspaceUserSummary[];

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

/** A page of workspaces of one kind. */
export class PaginatedWorkspacesResponse {
  @ApiProperty({ type: [WorkspaceResponse] })
  items!: WorkspaceResponse[];

  @ApiProperty({ example: 1, description: "1-based page number." })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({
    example: 7,
    description: "Total workspaces matching the filter.",
  })
  total!: number;
}
