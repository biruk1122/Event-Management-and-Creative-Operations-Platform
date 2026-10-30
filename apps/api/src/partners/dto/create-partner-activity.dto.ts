import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";

/** Rejects a value that is empty once trimmed. */
const NOT_BLANK = /\S/;

export class CreatePartnerActivityDto {
  @ApiProperty({
    example: "Sent the sponsorship deck; awaiting reply.",
    minLength: 1,
    maxLength: 2000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(NOT_BLANK, { message: "note must not be blank" })
  note!: string;
}
