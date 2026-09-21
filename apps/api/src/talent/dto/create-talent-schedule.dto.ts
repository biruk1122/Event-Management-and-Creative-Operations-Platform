import { ApiProperty } from "@nestjs/swagger";
import {
  IsISO8601,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

const NOT_BLANK = /\S/;

export class CreateTalentScheduleDto {
  @ApiProperty({ example: "Dress rehearsal", minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "title must not be blank" })
  title!: string;

  @ApiProperty({ format: "date-time" })
  @IsISO8601({ strict: true })
  startAt!: string;

  @ApiProperty({ format: "date-time" })
  @IsISO8601({ strict: true })
  endAt!: string;
}
