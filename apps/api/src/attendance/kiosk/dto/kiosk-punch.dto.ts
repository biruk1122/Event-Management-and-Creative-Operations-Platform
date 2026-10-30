import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsString, MaxLength, MinLength } from "class-validator";

import { PunchType } from "../../../generated/prisma/client.js";

export class KioskPunchDto {
  @ApiProperty({ description: "The short-lived token returned by /verify." })
  @IsString()
  @MinLength(1)
  sessionToken!: string;

  @ApiProperty({ enum: PunchType })
  @IsEnum(PunchType)
  punchType!: PunchType;

  @ApiProperty({
    description:
      "A client-generated idempotency key - retrying the same request with the same key never creates a duplicate punch.",
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  clientRequestId!: string;
}
