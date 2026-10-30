import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";

const NOT_BLANK = /\S/;

/** Shared by cancel and reinstate - both are a status flip that always
 * leaves a reason behind. */
export class ShiftReasonDto {
  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Matches(NOT_BLANK, { message: "reason must not be blank" })
  reason!: string;
}
