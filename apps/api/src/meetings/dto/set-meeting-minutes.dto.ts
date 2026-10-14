import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";

const NOT_BLANK = /\S/;

/** Minutes are recorded once a meeting has happened; sending an empty value
 * is rejected rather than silently clearing them - use the same route again
 * with corrected text to edit an existing record. */
export class SetMeetingMinutesDto {
  @ApiProperty({ maxLength: 10000 })
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  @Matches(NOT_BLANK, { message: "minutes must not be blank" })
  minutes!: string;
}
