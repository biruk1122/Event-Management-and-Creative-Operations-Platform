import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
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

export class CreateEventTalentAssignmentDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  eventId!: string;

  @ApiProperty({ example: "Headliner", minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "role must not be blank" })
  role!: string;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601()
  startAt?: string | null;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601()
  endAt?: string | null;

  /** Confirms an override of conflicts the server reports; same rule as the assignment API. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acknowledgeConflicts?: boolean;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  overrideReason?: string | null;
}
