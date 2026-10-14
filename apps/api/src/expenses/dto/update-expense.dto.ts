import { ApiPropertyOptional } from "@nestjs/swagger";
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
  ValidateIf,
} from "class-validator";

import { ExpenseCategory } from "../../generated/prisma/client.js";

const NOT_BLANK = /\S/;

/**
 * Every field is optional. A field left out is untouched; `supplierId` and
 * `plannedAmount` are nullable and cleared by sending `null`. The event an
 * expense belongs to is fixed at creation and is not editable here.
 */
export class UpdateExpenseDto {
  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  supplierId?: string | null;

  @ApiPropertyOptional({ enum: ExpenseCategory })
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @ApiPropertyOptional({ minLength: 1, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(NOT_BLANK, { message: "description must not be blank" })
  description?: string;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999.99)
  plannedAmount?: number | null;

  @ApiPropertyOptional({ type: Number, minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999.99)
  actualAmount?: number;

  @ApiPropertyOptional({ description: "ISO-4217 alphabetic code." })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, {
    message: "currency must be a three-letter ISO-4217 code",
  })
  currency?: string;
}
