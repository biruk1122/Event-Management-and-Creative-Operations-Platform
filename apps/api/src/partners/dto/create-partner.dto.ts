import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

/** Rejects a value that is empty once trimmed. */
const NOT_BLANK = /\S/;

export class CreatePartnerDto {
  @ApiProperty({
    example: "Northbridge Media Group",
    minLength: 1,
    maxLength: 200,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "organizationName must not be blank" })
  organizationName!: string;

  @ApiProperty({ example: "Media", minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(NOT_BLANK, { message: "category must not be blank" })
  category!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "contactName must not be blank" })
  contactName?: string;

  @ApiPropertyOptional({ format: "email" })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Matches(NOT_BLANK, { message: "contactPhone must not be blank" })
  contactPhone?: string;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "The owning department (e.g. Marketing). Only honored for an " +
      "organization-scoped caller - a department-scoped caller's own " +
      "department is always used instead, regardless of this value.",
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({
    format: "uuid",
    description: "The campaign this opportunity relates to, where applicable.",
  })
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiPropertyOptional({
    format: "uuid",
    description: "The event this opportunity relates to, where applicable.",
  })
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @ApiPropertyOptional({
    example: "Co-branded media placement, estimated 5,000 ETB in kind",
    minLength: 1,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(NOT_BLANK, { message: "proposedContribution must not be blank" })
  proposedContribution?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(NOT_BLANK, { message: "notes must not be blank" })
  notes?: string;

  @ApiPropertyOptional({
    format: "date-time",
    description: "When this relationship next needs a follow-up.",
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  followUpAt?: string;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "The user responsible for this relationship. Must belong to the " +
      "same department as the partner, when the partner has one.",
  })
  @IsOptional()
  @IsUUID()
  ownerId?: string;
}
