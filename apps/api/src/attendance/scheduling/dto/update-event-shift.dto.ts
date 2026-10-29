import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

const NOT_BLANK = /\S/;

/** Metadata-only edits - never the schedule itself, which always goes
 * through `RescheduleEventShiftDto` so every time change leaves a reason
 * and a history row behind. */
export class UpdateEventShiftDto {
  @ApiPropertyOptional({ type: String, nullable: true, minLength: 1, maxLength: 200 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "label must not be blank" })
  label?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, minLength: 1, maxLength: 200 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "locationLabel must not be blank" })
  locationLabel?: string | null;

  @ApiPropertyOptional({ description: "Geofence center latitude." })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ description: "Geofence center longitude." })
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50_000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50_000)
  geofenceRadiusMeters?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1_440 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_440)
  breakMinutes?: number;
}
