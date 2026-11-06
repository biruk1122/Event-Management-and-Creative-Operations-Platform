import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

const NOT_BLANK = /\S/;

/** Assigns an existing central talent to this event. Mirrors the talent-side create. */
export class AssignEventTalentDto {
  @ApiProperty({
    format: "uuid",
    description: "The central talent record. Profiles are never created here.",
  })
  @IsUUID()
  talentId!: string;

  @ApiProperty({ example: "Headliner", minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "role must not be blank" })
  role!: string;

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601()
  startAt?: string | null;

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601()
  endAt?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  /** Confirms an override of the conflicts the server reports. Ignored when there are none. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acknowledgeConflicts?: boolean;

  @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  overrideReason?: string | null;
}
