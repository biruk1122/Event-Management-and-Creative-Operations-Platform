import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

const NOT_BLANK = /\S/;

export class DecideExceptionDto {
  @ApiProperty({ enum: ["APPROVED", "REJECTED"] })
  @IsIn(["APPROVED", "REJECTED"])
  decision!: "APPROVED" | "REJECTED";

  @ApiPropertyOptional({ minLength: 1, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Matches(NOT_BLANK, { message: "reviewNote must not be blank" })
  reviewNote?: string;
}
