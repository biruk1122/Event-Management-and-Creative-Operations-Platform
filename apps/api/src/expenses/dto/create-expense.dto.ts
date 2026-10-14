import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
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
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  eventId!: string;

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
