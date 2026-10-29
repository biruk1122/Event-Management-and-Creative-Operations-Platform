import { ApiProperty } from "@nestjs/swagger";
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

import { PunchType } from "../../../generated/prisma/client.js";

export class MobilePunchDto {
  @ApiProperty({ enum: PunchType })
  @IsEnum(PunchType)
  punchType!: PunchType;

  /** Required for CHECK_IN (which shift is this punch against); ignored
   * for CHECK_OUT, which always closes the caller's one open session
   * regardless of which channel opened it. */
  @ApiProperty({ format: "uuid", required: false })
  @ValidateIf((dto: MobilePunchDto) => dto.punchType === PunchType.CHECK_IN)
  @IsUUID()
  eventShiftId?: string;

  @ApiProperty({
    description:
      "Device GPS latitude. Omit entirely when location permission was denied or unavailable - the punch is still recorded, flagged for manager review.",
    required: false,
  })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiProperty({
    description: "Device-reported GPS accuracy radius, in meters.",
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100_000)
  accuracyMeters?: number;

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
