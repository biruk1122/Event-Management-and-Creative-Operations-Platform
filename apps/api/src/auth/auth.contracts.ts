import { ApiProperty } from "@nestjs/swagger";

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
