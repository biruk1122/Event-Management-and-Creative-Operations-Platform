import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import { TalentType } from "../../generated/prisma/client.js";

const NOT_BLANK = /\S/;

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
}
