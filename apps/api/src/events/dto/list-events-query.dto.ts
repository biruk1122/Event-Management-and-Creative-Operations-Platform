import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import { EventStatus, EventType } from "../../generated/prisma/client.js";

export class ListEventsQueryDto {
  @ApiPropertyOptional({ enum: EventStatus })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @ApiPropertyOptional({ enum: EventType })
  @IsOptional()
  @IsEnum(EventType)
  eventType?: EventType;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "Restrict to events whose connected workspace this user manages.",
  })
  @IsOptional()
  @IsUUID()
  managerId?: string;

  @ApiPropertyOptional({
    description: "Case-insensitive match against the event name.",
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({
    format: "date-time",
    description: "Only events that start at or after this UTC instant.",
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  startingAfter?: string;

  @ApiPropertyOptional({
    format: "date-time",
    description: "Only events that start at or before this UTC instant.",
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  startingBefore?: string;

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
