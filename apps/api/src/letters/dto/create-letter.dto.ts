import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

import {
  LetterCategory,
  LetterDirection,
} from "../../generated/prisma/client.js";

/**
 * Registers a letter. The reference number is always server-generated and
 * immutable - never accepted from the client, even if sent.
 */
export class CreateLetterDto {
  @ApiProperty({ enum: LetterDirection })
  @IsEnum(LetterDirection)
  direction!: LetterDirection;

  @ApiProperty({ enum: LetterCategory })
  @IsEnum(LetterCategory)
  category!: LetterCategory;

  @ApiProperty({ type: String, format: "date" })
  @IsDateString({ strict: true })
  date!: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiProperty({ minLength: 1, maxLength: 300 })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subject!: string;

  @ApiPropertyOptional({
    description: "Required when direction is INCOMING.",
    minLength: 1,
    maxLength: 200,
  })
  @ValidateIf((dto: CreateLetterDto) => dto.direction === "INCOMING")
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fromParty?: string;

  @ApiPropertyOptional({
    description: "Required when direction is OUTGOING.",
    minLength: 1,
    maxLength: 200,
  })
  @ValidateIf((dto: CreateLetterDto) => dto.direction === "OUTGOING")
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  toParty?: string;

  @ApiPropertyOptional({
    maxLength: 100,
    description:
      "The reference number printed on the received letter, distinct from Lela's own generated number. Incoming only.",
  })
  @IsOptional()
  @ValidateIf((dto: CreateLetterDto) => dto.direction === "INCOMING")
  @IsString()
  @MaxLength(100)
  senderReferenceNumber?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  shortDescription?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string;
}
