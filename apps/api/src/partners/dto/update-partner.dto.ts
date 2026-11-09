import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsNumber,
  Max,
  Min,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

import {
  PartnershipType,
  PartnerStatus,
} from "../../generated/prisma/client.js";

/** Rejects a value that is empty once trimmed. */
const NOT_BLANK = /\S/;

/**
 * Every field is optional. A field left out is untouched; a nullable field
 * sent as `null` is cleared. `departmentId` is not editable here - a
 * partner's owning department is fixed at creation.
 */
export class UpdatePartnerDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "organizationName must not be blank" })
  organizationName?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(NOT_BLANK, { message: "category must not be blank" })
  category?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "contactName must not be blank" })
  contactName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: "email" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEmail()
  contactEmail?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 50 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Matches(NOT_BLANK, { message: "contactPhone must not be blank" })
  contactPhone?: string | null;

  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  campaignId?: string | null;

  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  eventId?: string | null;

  @ApiPropertyOptional({ enum: PartnerStatus })
  @IsOptional()
  @IsEnum(PartnerStatus)
  status?: PartnerStatus;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(NOT_BLANK, { message: "proposedContribution must not be blank" })
  proposedContribution?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(NOT_BLANK, { message: "notes must not be blank" })
  notes?: string | null;

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601({ strict: true })
  followUpAt?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: "uuid",
    nullable: true,
    description:
      "The user responsible for this relationship. Must belong to the " +
      "same department as the partner, when the partner has one.",
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  ownerId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "partnershipName must not be blank" })
  partnershipName?: string | null;

  @ApiPropertyOptional({ enum: PartnershipType, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(PartnershipType)
  partnershipType?: PartnershipType | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  @Matches(NOT_BLANK, { message: "agreementDetails must not be blank" })
  agreementDetails?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: "2026-11-01" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "agreementStartOn must be YYYY-MM-DD",
  })
  @IsISO8601({ strict: true })
  agreementStartOn?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: "2027-01-31" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "agreementEndOn must be YYYY-MM-DD",
  })
  @IsISO8601({ strict: true })
  agreementEndOn?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999.99)
  agreedValueAmount?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: "ETB" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^[A-Z]{3}$/, {
    message: "agreedValueCurrency must be a three-letter ISO-4217 code",
  })
  agreedValueCurrency?: string | null;
}
