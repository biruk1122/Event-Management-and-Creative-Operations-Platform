import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

const NOT_BLANK = /\S/;

export const ASSIGNMENT_KINDS = ["EVENT", "PRODUCTION", "PROMOTION"] as const;

/** The window and the work a new or changed assignment would occupy. */
export class TalentAssignmentWindowDto {
  @ApiProperty({ enum: ASSIGNMENT_KINDS })
  @IsIn(ASSIGNMENT_KINDS)
  kind!: (typeof ASSIGNMENT_KINDS)[number];

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  workId!: string;

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601()
  startAt?: string | null;

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601()
  endAt?: string | null;
}

export class CreateTalentAssignmentDto extends TalentAssignmentWindowDto {
  @ApiProperty({ example: "Headliner", minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "role must not be blank" })
  role!: string;

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

export class UpdateTalentAssignmentDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "role must not be blank" })
  role?: string;

  @ApiPropertyOptional({ type: String, maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601()
  startAt?: string | null;

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601()
  endAt?: string | null;

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

export class TransitionTalentAssignmentDto {
  @ApiProperty({ enum: ["COMPLETED", "CANCELLED"] })
  @IsIn(["COMPLETED", "CANCELLED"])
  status!: "COMPLETED" | "CANCELLED";

  /** Required when cancelling; the service enforces that rule. */
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ListAssignableWorksQueryDto {
  @ApiProperty({ enum: ASSIGNMENT_KINDS })
  @IsIn(ASSIGNMENT_KINDS)
  kind!: (typeof ASSIGNMENT_KINDS)[number];

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
