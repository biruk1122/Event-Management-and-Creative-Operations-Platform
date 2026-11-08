import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import { CampaignMetricKey } from "../../generated/prisma/client.js";

/** Rejects a value that is empty once trimmed, matching the database CHECKs. */
const NOT_BLANK = /\S/;

/** A dated calendar day, `YYYY-MM-DD`. The range is checked by the service. */
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

export class CreateCampaignUpdateDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(NOT_BLANK, { message: "note must not be blank" })
  note!: string;
}

export class RecordCampaignMetricDto {
  @ApiProperty({ enum: CampaignMetricKey })
  @IsEnum(CampaignMetricKey)
  key!: CampaignMetricKey;

  @ApiProperty({
    type: Number,
    minimum: 0,
    maximum: 999999999999,
    description:
      "The value exactly as recorded, with at most two decimal places. It is stored and shown as given; nothing is computed from it.",
  })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999)
  value!: number;

  @ApiProperty({
    example: "2026-11-01",
    description: "The day the figure was recorded (YYYY-MM-DD).",
  })
  @IsString()
  @Matches(CALENDAR_DAY, { message: "recordedOn must be YYYY-MM-DD" })
  recordedOn!: string;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 500,
    description: "Where the figure came from, for example a platform report.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(NOT_BLANK, { message: "sourceNote must not be blank" })
  sourceNote?: string;
}

export class ListCampaignUpdatesQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}

export class ListCampaignMetricsQueryDto extends ListCampaignUpdatesQueryDto {
  @ApiPropertyOptional({ enum: CampaignMetricKey })
  @IsOptional()
  @IsEnum(CampaignMetricKey)
  key?: CampaignMetricKey;
}
