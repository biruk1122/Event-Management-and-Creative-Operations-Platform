import { ApiProperty } from "@nestjs/swagger";

export class KioskResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  locationLabel!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  revokedAt!: string | null;
}

/** Returned exactly once, at registration - the plaintext token is never
 * retrievable again afterward. */
export class KioskRegisteredResponse extends KioskResponse {
  @ApiProperty({
    description: "The kiosk's bearer secret. Shown only this once - store it on the device now.",
  })
  token!: string;
}

/** Deliberately minimal - no email, phone, or any other employee detail
 * that a shared kiosk device has no business displaying. */
export class KioskEmployeeOption {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class KioskVerifyResponse {
  @ApiProperty({ description: "Pass this to the punch endpoint within 90 seconds." })
  sessionToken!: string;

  @ApiProperty()
  employeeName!: string;

  @ApiProperty({ description: "Whether this employee currently has an open check-in." })
  hasOpenSession!: boolean;

  @ApiProperty({ format: "date-time" })
  expiresAt!: string;
}

export class KioskPunchResponse {
  @ApiProperty({ enum: ["CHECK_IN", "CHECK_OUT"] })
  punchType!: "CHECK_IN" | "CHECK_OUT";

  @ApiProperty({ format: "date-time" })
  recordedAt!: string;

  @ApiProperty()
  message!: string;
}
