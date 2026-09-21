import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import { CampaignActivityStatus } from "../../generated/prisma/client.js";

/** Rejects a value that is empty once trimmed, matching the database CHECKs. */
const NOT_BLANK = /\S/;

export class CreateCampaignActivityDto {
  @ApiProperty({
    example: "Teaser video release",
    minLength: 1,
    maxLength: 200,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "name must not be blank" })
  name!: string;

  @ApiPropertyOptional({
    example: "Publish the 30-second teaser across channels.",
    minLength: 1,
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(NOT_BLANK, { message: "description must not be blank" })
  description?: string;

  @ApiPropertyOptional({
    enum: CampaignActivityStatus,
    default: CampaignActivityStatus.PLANNED,
  })
  @IsOptional()
  @IsEnum(CampaignActivityStatus)
  status?: CampaignActivityStatus;

  @ApiPropertyOptional({
    format: "date-time",
    description:
      "UTC start. If both ends are given, the end may not precede it.",
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  startAt?: string;

  @ApiPropertyOptional({ format: "date-time", description: "UTC end." })
  @IsOptional()
  @IsISO8601({ strict: true })
  endAt?: string;
}
