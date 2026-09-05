import { ApiProperty } from "@nestjs/swagger";

const SCOPE_VALUES = [
  "ORGANIZATION",
  "DEPARTMENT",
  "TEAM",
  "WORKSPACE",
  "SELF",
  "MANAGEMENT",
] as const;

/** Public view of one permission in the fixed catalog. */
export class PermissionResponse {
  @ApiProperty({ example: "task.review" })
  key!: string;

  @ApiProperty({
    example:
      "Record Approved or Changes Requested while a task is Under Review.",
  })
  description!: string;
}

/** Public view of one `(permission key, scope)` grant on a role. */
export class RoleGrantResponse {
  @ApiProperty({ example: "task.review" })
  permissionKey!: string;

  @ApiProperty({ enum: SCOPE_VALUES, example: "ORGANIZATION" })
  scope!: (typeof SCOPE_VALUES)[number];
}

/** Public view of a configurable role, without its grants. */
export class RoleResponse {
  @ApiProperty({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  })
  id!: string;

  @ApiProperty({ example: "Regional Coordinator" })
  name!: string;

  @ApiProperty({
    type: String,
    example: "Coordinates activity across one region.",
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({
    example: false,
    description: "Whether this is one of the five built-in SRS roles.",
  })
  isSystem!: boolean;

  @ApiProperty({ format: "date-time" })
  createdAt!: Date;

  @ApiProperty({ format: "date-time" })
  updatedAt!: Date;
}

/** Public view of a role together with its permission grants. */
export class RoleWithGrantsResponse extends RoleResponse {
  @ApiProperty({ type: [RoleGrantResponse] })
  grants!: RoleGrantResponse[];
}
