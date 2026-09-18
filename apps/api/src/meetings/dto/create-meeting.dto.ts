import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import { MeetingType } from "../../generated/prisma/client.js";

const NOT_BLANK = /\S/;

export class CreateMeetingDto {
  @ApiProperty({ example: "Production stand-up", maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "title must not be blank" })
  title!: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  @Matches(NOT_BLANK, { message: "description must not be blank" })
  description?: string;

  @ApiProperty({ enum: MeetingType })
  @IsEnum(MeetingType)
  type!: MeetingType;

  @ApiProperty({ format: "date-time", description: "UTC meeting start." })
  @IsISO8601({ strict: true })
  startAt!: string;

  @ApiProperty({ format: "date-time", description: "UTC meeting end." })
  @IsISO8601({ strict: true })
  endAt!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(NOT_BLANK, { message: "location must not be blank" })
  location?: string;

  @ApiPropertyOptional({ format: "uri", maxLength: 2000 })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ["https"] })
  @MaxLength(2000)
  onlineLink?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  reminderAt?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @ApiPropertyOptional({ type: [String], format: "uuid", maxItems: 100 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  participantIds: string[] = [];
}
