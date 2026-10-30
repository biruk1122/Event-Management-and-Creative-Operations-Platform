import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

const NOT_BLANK = /\S/;

/** At least one of `plannedStartAt`/`plannedEndAt` is expected; the service
 * rejects a reschedule that changes neither. */
export class RescheduleEventShiftDto {
  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  plannedStartAt?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  plannedEndAt?: string;

  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Matches(NOT_BLANK, { message: "reason must not be blank" })
  reason!: string;
}
