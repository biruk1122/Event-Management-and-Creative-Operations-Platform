import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

import { TalentType } from "../../generated/prisma/client.js";
import { CreateTalentSocialLinkDto } from "./create-talent-social-link.dto.js";

const NOT_BLANK = /\S/;

/**
 * Digits with an optional leading plus and common separators, allowing the
 * surrounding whitespace the service trims away. Mirrored by the web form.
 */
export const PHONE_PATTERN = /^\s*\+?[0-9(][0-9 ()\-.]{3,24}\s*$/;

/**
 * The states a new profile may start in. The web form calls this field
 * "Status". `ASSIGNED` only comes from assigning work, so it is never a
 * starting state. `INACTIVE` is allowed because a profile can be created
 * already archived, with no work to block it.
 */
export const STARTING_AVAILABILITY = [
  "AVAILABLE",
  "UNAVAILABLE",
  "INACTIVE",
] as const;

export class CreateTalentDto {
  @ApiProperty({ example: "Amina Tesfaye", minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "fullName must not be blank" })
  fullName!: string;

  @ApiProperty({ enum: TalentType })
  @IsEnum(TalentType)
  type!: TalentType;

  @ApiPropertyOptional({ example: "amina@example.com" })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({ example: "+251911000000", maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(NOT_BLANK, { message: "phone must not be blank" })
  @Matches(PHONE_PATTERN, {
    message: "phone must contain digits, spaces or + only",
  })
  phone?: string;

  @ApiPropertyOptional({
    example: "Singer and live performer.",
    maxLength: 4000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @Matches(NOT_BLANK, { message: "biography must not be blank" })
  biography?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  managerId?: string;

  /** Starting status, stored in the same column as availability. Defaults to AVAILABLE. */
  @ApiPropertyOptional({ enum: STARTING_AVAILABILITY })
  @IsOptional()
  @IsIn(STARTING_AVAILABILITY)
  availability?: (typeof STARTING_AVAILABILITY)[number];

  /** The first social link, saved with the profile in the same write. */
  @ApiPropertyOptional({ type: () => CreateTalentSocialLinkDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateTalentSocialLinkDto)
  socialLink?: CreateTalentSocialLinkDto;
}
