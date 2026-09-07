import { ApiProperty } from "@nestjs/swagger";

/** The user who manages a department, if one is assigned. */
export class DepartmentManagerSummary {
  @ApiProperty({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  })
  id!: string;

  @ApiProperty({ format: "email", example: "morgan.lead@example.com" })
  email!: string;

  @ApiProperty({ type: String, nullable: true, example: "Morgan" })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true, example: "Lead" })
  lastName!: string | null;
}

/**
 * Public view of a department and its composition. `deactivatedAt` is the
 * safe-deactivation marker (null means active); departments carry no SRS
 * status field. "Active projects/tasks" from SRS 5.3 are derived summaries a
 * later slice adds once those modules exist.
 */
export class DepartmentResponse {
  @ApiProperty({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  })
  id!: string;

  @ApiProperty({ example: "Event Management" })
  name!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: "Owns planning and delivery for all events.",
  })
  description!: string | null;

  @ApiProperty({
    type: DepartmentManagerSummary,
    nullable: true,
    description: "Null when no manager is assigned.",
  })
  manager!: DepartmentManagerSummary | null;

  @ApiProperty({
    example: 12,
    description: "How many active or inactive users are assigned here.",
  })
  employeeCount!: number;

  @ApiProperty({
    type: String,
    format: "date-time",
    nullable: true,
    description: "Set while the department is deactivated; null when active.",
  })
  deactivatedAt!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

/** A page of departments for the administration list. */
export class PaginatedDepartmentsResponse {
  @ApiProperty({ type: [DepartmentResponse] })
  items!: DepartmentResponse[];

  @ApiProperty({ example: 1, description: "1-based page number." })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({
    example: 7,
    description: "Total departments matching the filter.",
  })
  total!: number;
}
