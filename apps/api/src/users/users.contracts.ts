import { ApiProperty } from "@nestjs/swagger";

const STATUS_VALUES = ["ACTIVE", "INACTIVE"] as const;

/** The role a user currently holds, if any. */
export class UserRoleSummary {
  @ApiProperty({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  })
  id!: string;

  @ApiProperty({ example: "Regional Coordinator" })
  name!: string;
}

/** Public view of a user account and profile. Never carries credential data. */
export class UserResponse {
  @ApiProperty({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  })
  id!: string;

  @ApiProperty({ format: "email", example: "regional.coordinator@example.com" })
  email!: string;

  @ApiProperty({ type: String, nullable: true, example: "Ada" })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true, example: "Lovelace" })
  lastName!: string | null;

  @ApiProperty({ type: String, nullable: true, example: "+1 (555) 010-2030" })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true, example: "avatars/ada.png" })
  profileImage!: string | null;

  @ApiProperty({ enum: STATUS_VALUES, example: "ACTIVE" })
  status!: (typeof STATUS_VALUES)[number];

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  deactivatedAt!: string | null;

  @ApiProperty({
    type: UserRoleSummary,
    nullable: true,
    description: "Null when the user holds only the baseline grants.",
  })
  role!: UserRoleSummary | null;

  @ApiProperty({
    example: false,
    description:
      "True while the account still uses the password an operator set for it.",
  })
  mustChangePassword!: boolean;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

/** A page of users for the administration list. */
export class PaginatedUsersResponse {
  @ApiProperty({ type: [UserResponse] })
  items!: UserResponse[];

  @ApiProperty({ example: 1, description: "1-based page number." })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({
    example: 137,
    description: "Total users matching the filter.",
  })
  total!: number;
}
