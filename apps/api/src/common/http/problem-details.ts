import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** RFC 9457 Problem Details, extended with a stable `code` and the request id. */
export class ProblemDetails {
  @ApiProperty({
    example: "https://api.event-platform.local/problems/validation_error",
  })
  type!: string;

  @ApiProperty({ example: "Validation Failed" })
  title!: string;

  @ApiProperty({ example: 400 })
  status!: number;

  @ApiProperty({ example: "One or more request values are invalid." })
  detail!: string;

  @ApiProperty({ example: "/api/v1/auth/login" })
  instance!: string;

  @ApiProperty({ example: "VALIDATION_ERROR" })
  code!: string;

  @ApiProperty({ example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77" })
  requestId!: string;

  @ApiPropertyOptional({
    description: "Field-level details when the failure is a validation error.",
  })
  errors?: unknown;
}
