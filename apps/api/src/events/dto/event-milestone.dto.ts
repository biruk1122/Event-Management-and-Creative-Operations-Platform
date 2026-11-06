import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

import { EventMilestoneStatus } from "../../generated/prisma/client.js";

const NOT_BLANK = /\S/;
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateEventMilestoneDto {
  @ApiProperty({ example: "Venue & permits confirmed", maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "name must not be blank" })
  name!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(NOT_BLANK, { message: "description must not be blank" })
  description?: string;

  @ApiProperty({ format: "date", example: "2026-10-10" })
  @IsISO8601({ strict: true })
  @Matches(CALENDAR_DATE, { message: "dueDate must be YYYY-MM-DD" })
  dueDate!: string;

  @ApiPropertyOptional({
    enum: EventMilestoneStatus,
    default: EventMilestoneStatus.NOT_STARTED,
  })
  @IsOptional()
  @IsEnum(EventMilestoneStatus)
  status?: EventMilestoneStatus;
}

export class UpdateEventMilestoneDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "name must not be blank" })
  name?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 2000,
    description: "Null clears the description.",
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(NOT_BLANK, { message: "description must not be blank" })
  description?: string | null;

  @ApiPropertyOptional({ format: "date" })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(CALENDAR_DATE, { message: "dueDate must be YYYY-MM-DD" })
  dueDate?: string;

  @ApiPropertyOptional({ enum: EventMilestoneStatus })
  @IsOptional()
  @IsEnum(EventMilestoneStatus)
  status?: EventMilestoneStatus;
}
