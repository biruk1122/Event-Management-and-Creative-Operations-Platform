import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PermissionScope } from "../generated/prisma/enums.js";
import {
  PLATFORM_ROLES,
  type PlatformRole,
} from "../common/security/department-access.policy.js";

export class AccessDepartmentResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  active!: boolean;
}

/** A department the caller oversees read-only (EVE-229, ADR 0008). */
export class OverseenDepartmentResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class EffectivePermissionResponse {
  @ApiProperty()
  permissionKey!: string;

  @ApiProperty({ enum: PermissionScope })
  scope!: PermissionScope;
}

/** The current account's grants, for permission-aware clients. */
export class CurrentAccessResponse {
  @ApiProperty({ format: "uuid" })
  userId!: string;

  @ApiProperty({ type: [EffectivePermissionResponse] })
  grants!: EffectivePermissionResponse[];

  @ApiPropertyOptional({ enum: PLATFORM_ROLES, nullable: true })
  role!: PlatformRole | null;

  @ApiPropertyOptional({ type: AccessDepartmentResponse, nullable: true })
  department!: AccessDepartmentResponse | null;

  // Optional in the contract so existing clients and fixtures stay valid; the
  // API always sends it (an empty list for everyone but an overseeing manager).
  @ApiPropertyOptional({
    type: [OverseenDepartmentResponse],
    description:
      "Departments this account oversees read-only. Empty unless the account manages a department that oversees others.",
  })
  overseenDepartments?: OverseenDepartmentResponse[];
}

/** Public view of the authenticated account. Never carries credential data. */
export class AuthenticatedUserResponse {
  @ApiProperty({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  })
  id!: string;

  @ApiProperty({ format: "email", example: "manager@example.com" })
  email!: string;

  @ApiProperty({ enum: ["ACTIVE", "INACTIVE"], example: "ACTIVE" })
  status!: "ACTIVE" | "INACTIVE";
}

export class SessionResponse {
  @ApiProperty({ type: AuthenticatedUserResponse })
  user!: AuthenticatedUserResponse;
}
