import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import { EventType } from "../../generated/prisma/client.js";

/** Rejects a value that is empty once trimmed, matching the database CHECKs. */
const NOT_BLANK = /\S/;

export class CreateEventDto {
  @ApiProperty({
    example: "Autumn Product Launch",
    minLength: 1,
    maxLength: 200,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "name must not be blank" })
  name!: string;

  @ApiProperty({ enum: EventType })
  @IsEnum(EventType)
  eventType!: EventType;

  @ApiPropertyOptional({
    example: "Opening night gala for partners and press.",
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

  @ApiPropertyOptional({ example: "Grand Hall", minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "location must not be blank" })
  location?: string;

  @ApiPropertyOptional({
    example: "City Arts Council",
    minLength: 1,
    maxLength: 200,
    description:
      "Free text for now. Whether an organizer is a user, contact, or record is open in OD-16.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "organizerName must not be blank" })
  organizerName?: string;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "Assign this user as the event manager on the connected workspace at creation.",
  })
  @IsOptional()
  @IsUUID()
  managerId?: string;
}
