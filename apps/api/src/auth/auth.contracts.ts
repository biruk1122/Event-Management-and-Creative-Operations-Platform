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
