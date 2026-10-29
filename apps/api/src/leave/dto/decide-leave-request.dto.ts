import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

const NOT_BLANK = /\S/;

export class DecideLeaveRequestDto {
  @ApiProperty({ enum: ["APPROVED", "REJECTED", "RETURNED_FOR_CHANGES"] })
  @IsIn(["APPROVED", "REJECTED", "RETURNED_FOR_CHANGES"])
  decision!: "APPROVED" | "REJECTED" | "RETURNED_FOR_CHANGES";

  @ApiPropertyOptional({ minLength: 1, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Matches(NOT_BLANK, { message: "reviewNote must not be blank" })
  reviewNote?: string;
}
