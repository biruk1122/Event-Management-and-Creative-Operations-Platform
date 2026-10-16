import { ApiProperty } from "@nestjs/swagger";
import {
  IsDefined,
  IsNumber,
  Matches,
  Max,
  Min,
  ValidateIf,
} from "class-validator";

/**
 * Sets or clears the production budget. Send an amount and a currency
 * together to set it, or both as `null` to clear it. A mismatched pair is
 * rejected by the service with `PRODUCTION_BUDGET_INCOMPLETE`.
 */
export class SetProductionBudgetDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 15000,
    minimum: 0,
    description: "Non-negative, at most two fraction digits. Null to clear.",
  })
  @IsDefined()
  @ValidateIf((dto: SetProductionBudgetDto) => dto.amount !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999.99)
  amount!: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: "USD",
    description:
      "ISO-4217 alphabetic code (three upper-case letters). Null to clear.",
  })
  @IsDefined()
  @ValidateIf((dto: SetProductionBudgetDto) => dto.currency !== null)
  @Matches(/^[A-Z]{3}$/, {
    message: "currency must be a three-letter ISO-4217 code",
  })
  currency!: string | null;
}
