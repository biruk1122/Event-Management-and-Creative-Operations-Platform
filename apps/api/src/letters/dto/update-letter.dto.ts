import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

/**
 * Edits a letter's permitted fields. `direction`, `category`, and the
 * reference number are never editable after creation - the reference
 * number's `{category}` segment would otherwise drift from the letter's own
 * category, and a letter's direction (and so which single party field
 * applies) is a fact about how it was recorded, not an editable attribute.
 */
export class UpdateLetterDto {
  @ApiPropertyOptional({ type: String, format: "date" })
  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;

  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @IsOptional()
  @ValidateIf((_dto: UpdateLetterDto, value: unknown) => value !== null)
  @IsUUID()
  projectId?: string | null;

  @ApiPropertyOptional({ minLength: 1, maxLength: 300 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subject?: string;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 200,
    description: "Only applies to an INCOMING letter.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fromParty?: string;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 200,
    description: "Only applies to an OUTGOING letter.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  toParty?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 100 })
  @IsOptional()
  @ValidateIf((_dto: UpdateLetterDto, value: unknown) => value !== null)
  @IsString()
  @MaxLength(100)
  senderReferenceNumber?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @ValidateIf((_dto: UpdateLetterDto, value: unknown) => value !== null)
  @IsString()
  @MaxLength(2000)
  shortDescription?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @ValidateIf((_dto: UpdateLetterDto, value: unknown) => value !== null)
  @IsString()
  @MaxLength(2000)
  remark?: string | null;
}
