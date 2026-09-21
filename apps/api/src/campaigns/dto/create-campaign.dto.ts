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

import { CampaignType } from "../../generated/prisma/client.js";

/** Rejects a value that is empty once trimmed, matching the database CHECKs. */
const NOT_BLANK = /\S/;

export class CreateCampaignDto {
  @ApiProperty({
    example: "Autumn Launch Push",
    minLength: 1,
    maxLength: 200,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "name must not be blank" })
  name!: string;

  @ApiProperty({
    enum: CampaignType,
    description: "The owning module: Marketing or Promotion.",
  })
  @IsEnum(CampaignType)
  campaignType!: CampaignType;

  @ApiPropertyOptional({
    example: "Awareness push ahead of the launch.",
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
    example: "Young adults in urban areas",
    minLength: 1,
    maxLength: 500,
    description: "The target audience. Free text for now.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(NOT_BLANK, { message: "audience must not be blank" })
  audience?: string;

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
      "The event this campaign optionally relates to. A soft cross-reference, not ownership. Cannot be combined with `productName`.",
  })
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @ApiPropertyOptional({
    example: "Nexo Energy Drink",
    minLength: 1,
    maxLength: 200,
    description:
      "The product this campaign promotes. Cannot be combined with `eventId`.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "productName must not be blank" })
  productName?: string;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "Assign this user as the campaign manager on the connected workspace at creation.",
  })
  @IsOptional()
  @IsUUID()
  managerId?: string;
}
