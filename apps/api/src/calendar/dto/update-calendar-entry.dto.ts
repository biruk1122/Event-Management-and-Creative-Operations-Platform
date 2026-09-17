import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from "class-validator";

export class UpdateCalendarEntryDto {
  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/\S/, { message: "title must not be blank" })
  title?: string;
  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: 10_000,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  @Matches(/\S/, { message: "description must not be blank" })
  description?: string | null;
  @ApiPropertyOptional({ type: String, format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  startAt?: string;
  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  endAt?: string | null;
}
