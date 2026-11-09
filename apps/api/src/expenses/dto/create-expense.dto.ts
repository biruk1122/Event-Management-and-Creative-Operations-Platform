import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import { ExpenseCategory } from "../../generated/prisma/client.js";

const NOT_BLANK = /\S/;

export class CreateExpenseDto {
  @ApiPropertyOptional({
    format: "uuid",
    description:
      "The event this expense belongs to. At least one of eventId/productionId is required.",
  })
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "The production this expense belongs to - lets a production with no linked event still record its own spend. At least one of eventId/productionId is required.",
  })
  @IsOptional()
  @IsUUID()
  productionId?: string;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "The campaign this expense belongs to (EVE-233). An expense needs an event, a production or a campaign.",
  })
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiPropertyOptional({
    format: "uuid",
    description: "One of the campaign's activities. Requires campaignId.",
  })
  @IsOptional()
  @IsUUID()
  campaignActivityId?: string;

  @ApiPropertyOptional({ example: "Flyer printing", maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "title must not be blank" })
  title?: string;

  @ApiPropertyOptional({
    example: "2026-11-09",
    description: "The day the money was spent (YYYY-MM-DD).",
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "expenseDate must be YYYY-MM-DD" })
  @IsISO8601({ strict: true })
  expenseDate?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiProperty({ enum: ExpenseCategory })
  @IsEnum(ExpenseCategory)
  category!: ExpenseCategory;

  @ApiProperty({
    example: "Stage lighting rental",
    minLength: 1,
    maxLength: 500,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(NOT_BLANK, { message: "description must not be blank" })
  description!: string;

  @ApiPropertyOptional({
    type: Number,
    example: 1200,
    minimum: 0,
    description:
      "This line item's planned amount, at most two fraction digits.",
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999.99)
  plannedAmount?: number;

  @ApiProperty({
    type: Number,
    example: 1350,
    minimum: 0,
    description: "Non-negative, at most two fraction digits.",
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999.99)
  actualAmount!: number;

  @ApiProperty({
    example: "USD",
    description: "ISO-4217 alphabetic code (three upper-case letters).",
  })
  @Matches(/^[A-Z]{3}$/, {
    message: "currency must be a three-letter ISO-4217 code",
  })
  currency!: string;
}
