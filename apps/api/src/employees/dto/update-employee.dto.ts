import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

import {
  EmployeeGender,
  EmploymentType,
} from "../../generated/prisma/client.js";

/**
 * Edits an employee's HR fields, and optionally the linked user's own
 * display name/phone. Never touches role, department, or login/account
 * status - those stay the Users module's job (see `UsersService`).
 * Employment status changes go through `UpdateEmployeeStatusDto` instead,
 * since that transition carries its own audit trail.
 */
export class UpdateEmployeeDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    maxLength: 32,
    description: "The employee's own personal number.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  personalPhone?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 160 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  position?: string;

  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional({ type: String, format: "date" })
  @IsOptional()
  @IsDateString({ strict: true })
  employmentDate?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 160 })
  @IsOptional()
  @ValidateIf((_dto: UpdateEmployeeDto, value: unknown) => value !== null)
  @IsString()
  @MaxLength(160)
  workLocation?: string | null;

  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @IsOptional()
  @ValidateIf((_dto: UpdateEmployeeDto, value: unknown) => value !== null)
  @IsUUID()
  reportingManagerId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 64 })
  @IsOptional()
  @ValidateIf((_dto: UpdateEmployeeDto, value: unknown) => value !== null)
  @IsString()
  @MaxLength(64)
  grade?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 4000 })
  @IsOptional()
  @ValidateIf((_dto: UpdateEmployeeDto, value: unknown) => value !== null)
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0 })
  @IsOptional()
  @ValidateIf((_dto: UpdateEmployeeDto, value: unknown) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999.99)
  baseSalary?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 64 })
  @IsOptional()
  @ValidateIf((_dto: UpdateEmployeeDto, value: unknown) => value !== null)
  @IsString()
  @MaxLength(64)
  salaryScale?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0 })
  @IsOptional()
  @ValidateIf((_dto: UpdateEmployeeDto, value: unknown) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999.99)
  allowanceAmount?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: "ETB" })
  @IsOptional()
  @ValidateIf((_dto: UpdateEmployeeDto, value: unknown) => value !== null)
  @Matches(/^[A-Z]{3}$/, {
    message: "currency must be a three-letter ISO-4217 code",
  })
  currency?: string | null;

  @ApiPropertyOptional({ enum: EmployeeGender, nullable: true })
  @IsOptional()
  @ValidateIf((_dto: UpdateEmployeeDto, value: unknown) => value !== null)
  @IsEnum(EmployeeGender)
  gender?: EmployeeGender | null;

  @ApiPropertyOptional({ type: String, format: "date", nullable: true })
  @IsOptional()
  @ValidateIf((_dto: UpdateEmployeeDto, value: unknown) => value !== null)
  @IsDateString({ strict: true })
  dateOfBirth?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 120 })
  @IsOptional()
  @ValidateIf((_dto: UpdateEmployeeDto, value: unknown) => value !== null)
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 120 })
  @IsOptional()
  @ValidateIf((_dto: UpdateEmployeeDto, value: unknown) => value !== null)
  @IsString()
  @MaxLength(120)
  subCity?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 120 })
  @IsOptional()
  @ValidateIf((_dto: UpdateEmployeeDto, value: unknown) => value !== null)
  @IsString()
  @MaxLength(120)
  woreda?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 64,
    description: "Payroll bank account number.",
  })
  @IsOptional()
  @ValidateIf((_dto: UpdateEmployeeDto, value: unknown) => value !== null)
  @IsString()
  @MaxLength(64)
  bankAccountNumber?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 32,
    description: "A company-issued phone number.",
  })
  @IsOptional()
  @ValidateIf((_dto: UpdateEmployeeDto, value: unknown) => value !== null)
  @IsString()
  @MaxLength(32)
  companyPhone?: string | null;
}
