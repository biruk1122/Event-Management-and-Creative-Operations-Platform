import { ApiProperty } from "@nestjs/swagger";
import {
  IsDateString,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

const NOT_BLANK = /\S/;

export class CreateHolidayDto {
  @ApiProperty({ type: String, format: "date" })
  @IsDateString({ strict: true })
  date!: string;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "name must not be blank" })
  name!: string;
}
