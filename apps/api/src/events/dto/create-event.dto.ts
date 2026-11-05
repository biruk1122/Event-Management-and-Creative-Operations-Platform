import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import { EventType } from "../../generated/prisma/client.js";

/** Rejects a value that is empty once trimmed, matching the database CHECKs. */
const NOT_BLANK = /\S/;

/** A new event starts in planning or ready; later states are reached through
 * the lifecycle transition route, never by creating an event directly. */
export const CREATABLE_EVENT_STATUSES = ["PLANNING", "READY"] as const;

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

  @ApiPropertyOptional({
    format: "date-time",
    description:
      "UTC reminder instant. Requires startAt to be set and may not be later than it.",
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  reminderAt?: string;

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

  @ApiPropertyOptional({
    enum: CREATABLE_EVENT_STATUSES,
    default: "PLANNING",
    description:
      "Starting lifecycle state. Defaults to PLANNING; later states use the transition route.",
  })
  @IsOptional()
  @IsIn(CREATABLE_EVENT_STATUSES)
  status?: (typeof CREATABLE_EVENT_STATUSES)[number];

  @ApiPropertyOptional({
    type: [String],
    format: "uuid",
    maxItems: 20,
    description:
      "Teams to assign to the event's connected workspace at creation. Requires event.assign_teams.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  teamIds?: string[];

  @ApiPropertyOptional({
    example: 2500000,
    minimum: 0,
    description:
      "Planned budget. Requires event.budget.update. Two fraction digits at most.",
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999.99)
  budgetAmount?: number;

  @ApiPropertyOptional({
    example: "ETB",
    description:
      "ISO-4217 code for budgetAmount. Defaults to ETB when a budget is given.",
  })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, {
    message: "budgetCurrency must be three upper-case letters",
  })
  budgetCurrency?: string;
}
