import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const NOT_BLANK = /\S/;

export class CreateEventShiftDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "label must not be blank" })
  label?: string;

  @ApiProperty({
    format: "date-time",
    description: "UTC start. Explicit datetime, never a date-only field.",
  })
  @IsISO8601({ strict: true })
  plannedStartAt!: string;

  @ApiProperty({
    format: "date-time",
    description: "UTC end. Must be strictly after plannedStartAt - an overnight shift is one row.",
  })
  @IsISO8601({ strict: true })
  plannedEndAt!: string;

  @ApiProperty({ example: "Africa/Addis_Ababa" })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  timeZone!: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "locationLabel must not be blank" })
  locationLabel?: string;

  @ApiProperty({ description: "Geofence center latitude." })
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ description: "Geofence center longitude." })
  @IsLongitude()
  longitude!: number;

  @ApiPropertyOptional({
    description: "Geofence radius in meters. Defaults to 150.",
    minimum: 1,
    maximum: 50_000,
  })
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
