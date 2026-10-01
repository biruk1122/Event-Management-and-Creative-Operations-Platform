import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ArrayMaxSize,
  ArrayUnique,
} from "class-validator";

import {
  ReportReviewOutcome,
  ReportType,
} from "../../generated/prisma/client.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NONBLANK = /\S/;

export class CreateReportDto {
  @ApiProperty({ enum: ReportType })
  @IsEnum(ReportType)
  type!: ReportType;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  @Matches(NONBLANK)
  title!: string;

  @ApiProperty({ format: "date", example: "2026-09-01" })
  @Matches(DATE)
  periodStart!: string;

  @ApiProperty({ format: "date", example: "2026-09-30" })
  @Matches(DATE)
  periodEnd!: string;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "Defaults to the caller's department; organization-scoped creators may choose another.",
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ type: [String], format: "uuid", maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  workspaceIds?: string[];

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Matches(NONBLANK)
  problemsEncountered?: string;
  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Matches(NONBLANK)
  nextDayPlan?: string;
  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Matches(NONBLANK)
  departmentActivities?: string;
  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Matches(NONBLANK)
  majorAchievements?: string;
  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Matches(NONBLANK)
  challenges?: string;
  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Matches(NONBLANK)
  nextWeekPlan?: string;
  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Matches(NONBLANK)
  departmentPerformance?: string;
  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Matches(NONBLANK)
  employeePerformance?: string;
}

export class UpdateReportDto extends PartialType(CreateReportDto) {}

export class ReviewReportDto {
  @ApiProperty({ enum: ReportReviewOutcome })
  @IsEnum(ReportReviewOutcome)
  outcome!: ReportReviewOutcome;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Matches(NONBLANK)
  note?: string;
}
