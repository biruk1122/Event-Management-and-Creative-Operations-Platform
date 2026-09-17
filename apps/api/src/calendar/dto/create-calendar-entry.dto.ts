import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from "class-validator";

export class CreateCalendarEntryDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @Matches(/\S/, { message: "title must not be blank" })
  title!: string;
  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 10_000 })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  @Matches(/\S/, { message: "description must not be blank" })
  description?: string;
  @ApiProperty({ enum: ["PERSONAL", "REMINDER"] })
  @IsIn(["PERSONAL", "REMINDER"])
  type!: "PERSONAL" | "REMINDER";
  @ApiProperty({ type: String, format: "date-time" })
  @IsISO8601({ strict: true })
  startAt!: string;
  @ApiPropertyOptional({ type: String, format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  endAt?: string;
}
