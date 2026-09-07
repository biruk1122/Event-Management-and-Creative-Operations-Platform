import { ApiProperty } from "@nestjs/swagger";
import { PermissionScope } from "../generated/prisma/enums.js";

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
