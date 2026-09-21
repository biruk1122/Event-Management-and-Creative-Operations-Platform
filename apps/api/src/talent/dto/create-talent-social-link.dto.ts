import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

const NOT_BLANK = /\S/;

export class CreateTalentSocialLinkDto {
  @ApiProperty({ example: "Instagram", minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(NOT_BLANK, { message: "label must not be blank" })
  label!: string;

  @ApiProperty({ example: "https://instagram.com/amina" })
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  url!: string;
}
