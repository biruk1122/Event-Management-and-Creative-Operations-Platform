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
 * Sets or clears the event budget. Send an amount and a currency together to
 * set it, or both as `null` to clear it. A mismatched pair is rejected by the
 * service with `EVENT_BUDGET_INCOMPLETE`. Supported currencies, rounding, and
 * the organization default are open in OD-14; this route accepts any ISO-4217
 * alphabetic code and a non-negative amount with at most two fraction digits.
 */
export class SetEventBudgetDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 15000,
    minimum: 0,
    description: "Non-negative, at most two fraction digits. Null to clear.",
  })
  @IsDefined()
  @ValidateIf((dto: SetEventBudgetDto) => dto.amount !== null)
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
  @ValidateIf((dto: SetEventBudgetDto) => dto.currency !== null)
  @Matches(/^[A-Z]{3}$/, {
    message: "currency must be a three-letter ISO-4217 code",
  })
  currency!: string | null;
}
