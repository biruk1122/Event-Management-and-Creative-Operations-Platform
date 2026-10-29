import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

const NOT_BLANK = /\S/;

export class CreateLeaveRequestDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  leaveTypeId!: string;

  @ApiProperty({ type: String, format: "date", example: "2026-12-24" })
  @IsDateString({ strict: true })
  startDate!: string;

  @ApiProperty({ type: String, format: "date", example: "2026-12-26" })
  @IsDateString({ strict: true })
  endDate!: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Matches(NOT_BLANK, { message: "reason must not be blank" })
  reason?: string;
}
