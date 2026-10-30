import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import {
  IsDateString,
  IsEmail,
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
 * Registers an employee profile. Either `userId` is set (link an existing
 * account - the HR fields below become that account's employee profile), or
 * it is omitted and `email`/`firstName`/`lastName`/`departmentId`/`roleId`/
 * `temporaryPassword` must all be set (create a new account the same way
 * `CreateUserDto` does, in the same transaction as the employee profile).
 * Never both: an employee is always exactly one account.
 */
export class CreateEmployeeDto {
  @ApiPropertyOptional({
    format: "uuid",
    description: "Link this existing user account instead of creating one.",
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  // --- New-account fields (required together when `userId` is omitted) ---

  @ApiPropertyOptional({ format: "email", maxLength: 320 })
  @ValidateIf((dto: CreateEmployeeDto) => dto.userId === undefined)
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @ValidateIf((dto: CreateEmployeeDto) => dto.userId === undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @ValidateIf((dto: CreateEmployeeDto) => dto.userId === undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    minLength: 8,
    maxLength: 256,
    description:
      "Initial password; the account must change it on first sign-in.",
  })
  @ValidateIf((dto: CreateEmployeeDto) => dto.userId === undefined)
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  temporaryPassword?: string;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "Required when creating a new account: a Department Manager or Department Member role. A Super Admin role may never be assigned here.",
  })
  @ValidateIf((dto: CreateEmployeeDto) => dto.userId === undefined)
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "Required when creating a new account; from existing departments.",
  })
  @ValidateIf((dto: CreateEmployeeDto) => dto.userId === undefined)
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({
    example: "+1 (555) 010-2030",
    maxLength: 32,
    description:
      "The employee's own personal number. Only applied when creating a new account - stored on the linked User, not the employee profile.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  personalPhone?: string;

  // --- HR fields, always required ---

  @ApiProperty({ example: "EMP-0042", minLength: 1, maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  employeeCode!: string;

  @ApiProperty({
    example: "Social Media Coordinator",
    minLength: 1,
    maxLength: 160,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  position!: string;

  @ApiProperty({ enum: EmploymentType })
  @IsEnum(EmploymentType)
  employmentType!: EmploymentType;

  @ApiProperty({ type: String, format: "date" })
  @IsDateString({ strict: true })
  employmentDate!: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  workLocation?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  reportingManagerId?: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  grade?: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({
    type: Number,
    minimum: 0,
    example: 25000,
    description: "Non-negative, at most two fraction digits.",
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999.99)
  baseSalary?: number;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  salaryScale?: string;

  @ApiPropertyOptional({
    type: Number,
    minimum: 0,
    example: 1500,
    description: "Non-negative, at most two fraction digits.",
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999.99)
  allowanceAmount?: number;

  @ApiPropertyOptional({
    example: "ETB",
    description: "ISO-4217 alphabetic code. Required when any amount is set.",
  })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, {
    message: "currency must be a three-letter ISO-4217 code",
  })
  currency?: string;

  @ApiPropertyOptional({ enum: EmployeeGender })
  @IsOptional()
  @IsEnum(EmployeeGender)
  gender?: EmployeeGender;

  @ApiPropertyOptional({ type: String, format: "date" })
  @IsOptional()
  @IsDateString({ strict: true })
  dateOfBirth?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  subCity?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  woreda?: string;

  @ApiPropertyOptional({
    maxLength: 64,
    description: "Payroll bank account number.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  bankAccountNumber?: string;

  @ApiPropertyOptional({
    example: "+1 (555) 020-4040",
    maxLength: 32,
    description:
      "A company-issued phone number. Applies either way (new or linked account) - it belongs to the job, not the person.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  companyPhone?: string;
}
