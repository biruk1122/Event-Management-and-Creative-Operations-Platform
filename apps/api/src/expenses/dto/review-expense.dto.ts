import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

import { ExpenseReviewOutcome } from "../../generated/prisma/client.js";

const NOT_BLANK = /\S/;

export class ReviewExpenseDto {
  @ApiProperty({ enum: ExpenseReviewOutcome })
  @IsEnum(ExpenseReviewOutcome)
  outcome!: ExpenseReviewOutcome;

  @ApiPropertyOptional({
    maxLength: 2000,
    description: "Required context for a rejection; optional on an approval.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Matches(NOT_BLANK, { message: "note must not be blank" })
  note?: string;
}
