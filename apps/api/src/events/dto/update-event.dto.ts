import { ApiPropertyOptional } from "@nestjs/swagger";
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

import { EventType } from "../../generated/prisma/client.js";

/** Rejects a value that is empty once trimmed, matching the database CHECKs. */
const NOT_BLANK = /\S/;

/**
 * Every field is optional. A field left out is untouched; a nullable field sent
 * as `null` is cleared. `status` is not editable here - it moves only through
 * `POST /events/{id}/transition`. The budget is set through its own route.
 */
export class UpdateEventDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "name must not be blank" })
  name?: string;

  @ApiPropertyOptional({ enum: EventType })
  @IsOptional()
  @IsEnum(EventType)
  eventType?: EventType;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    minLength: 1,
    maxLength: 2000,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(NOT_BLANK, { message: "description must not be blank" })
  description?: string | null;

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601({ strict: true })
  startAt?: string | null;

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601({ strict: true })
  endAt?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    minLength: 1,
    maxLength: 200,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "location must not be blank" })
  location?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    minLength: 1,
    maxLength: 200,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "organizerName must not be blank" })
  organizerName?: string | null;
}
