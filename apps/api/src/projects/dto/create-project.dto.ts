import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

/** Rejects a value that is empty once trimmed, matching the database CHECKs. */
const NOT_BLANK = /\S/;

export class CreateProjectDto {
  @ApiProperty({ example: "Brand Refresh", minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "name must not be blank" })
  name!: string;

  @ApiPropertyOptional({
    example: "Redesign the visual identity.",
    minLength: 1,
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(NOT_BLANK, { message: "description must not be blank" })
  description?: string;

  @ApiPropertyOptional({
    format: "date-time",
    description:
      "UTC start. If both ends are given, the end may not precede it.",
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  startAt?: string;

  @ApiPropertyOptional({ format: "date-time", description: "UTC end." })
  @IsOptional()
  @IsISO8601({ strict: true })
  endAt?: string;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "The event this project optionally relates to. A soft cross-reference, not ownership.",
  })
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "Assign this user as the project manager on the connected workspace at creation.",
  })
  @IsOptional()
  @IsUUID()
  managerId?: string;
}
