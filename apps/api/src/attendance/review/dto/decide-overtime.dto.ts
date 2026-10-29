import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

const NOT_BLANK = /\S/;

export class DecideOvertimeDto {
  @ApiProperty({ enum: ["APPROVED", "REJECTED"] })
  @IsIn(["APPROVED", "REJECTED"])
  decision!: "APPROVED" | "REJECTED";

  @ApiPropertyOptional({
    description:
      "Required when approving. Never auto-derived from the potential minutes.",
    minimum: 0,
    maximum: 1_440,
  })
  @ValidateIf((dto: DecideOvertimeDto) => dto.decision === "APPROVED")
  @IsInt()
  @Min(0)
  @Max(1_440)
  approvedMinutes?: number;

  @ApiPropertyOptional({ minLength: 1, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Matches(NOT_BLANK, { message: "decisionReason must not be blank" })
  decisionReason?: string;
}
