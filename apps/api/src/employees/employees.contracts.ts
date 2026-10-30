import { ApiProperty } from "@nestjs/swagger";

import {
  EmployeeGender,
  EmploymentStatus,
  EmploymentType,
} from "../generated/prisma/client.js";

/**
 * HR-only data for an existing `User` account (EMP-01). Only ever returned to
 * the two authorized actors (Super Admin, or the HR & Executive Officer
 * department's own manager) - `EmployeesService` enforces this before any
 * record reaches here, so every field below, including compensation, is
 * always safe to return once a response is built.
 */
export class EmployeeResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid", description: "The linked user account." })
  userId!: string;

  @ApiProperty({ example: "EMP-0042" })
  employeeCode!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ format: "email" })
  email!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "The employee's own personal number.",
  })
  personalPhone!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "A company-issued phone number.",
  })
  companyPhone!: string | null;

  @ApiProperty({ enum: EmployeeGender, nullable: true })
  gender!: EmployeeGender | null;

  @ApiProperty({ type: String, format: "date", nullable: true })
  dateOfBirth!: string | null;

  @ApiProperty({ type: String, nullable: true })
  city!: string | null;

  @ApiProperty({ type: String, nullable: true })
  subCity!: string | null;

  @ApiProperty({ type: String, nullable: true })
  woreda!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Payroll bank account number.",
  })
  bankAccountNumber!: string | null;

  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description: "The employee's department, from the user's own record.",
  })
  departmentId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  departmentName!: string | null;

  @ApiProperty({ example: "Social Media Coordinator" })
  position!: string;

  @ApiProperty({ enum: EmploymentType })
  employmentType!: EmploymentType;

  @ApiProperty({ type: String, format: "date" })
  employmentDate!: string;

  @ApiProperty({ enum: EmploymentStatus })
  employmentStatus!: EmploymentStatus;

  @ApiProperty({ type: String, nullable: true })
  workLocation!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  reportingManagerId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  reportingManagerName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  grade!: string | null;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: "25000.00",
    description: "Decimal string. Null when no compensation is recorded.",
  })
  baseSalary!: string | null;

  @ApiProperty({ type: String, nullable: true })
  salaryScale!: string | null;

  @ApiProperty({ type: String, nullable: true, example: "1500.00" })
  allowanceAmount!: string | null;

  @ApiProperty({ type: String, nullable: true, example: "ETB" })
  currency!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: "26500.00",
    description:
      "Derived as baseSalary + allowanceAmount; never stored directly.",
  })
  totalCompensation!: string | null;

  @ApiProperty({
    enum: ["ACTIVE", "INACTIVE"],
    description:
      "The linked account's login/access status - distinct from employmentStatus.",
  })
  userStatus!: "ACTIVE" | "INACTIVE";

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  statusChangedAt!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  statusChangedById!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  createdById!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

export class PaginatedEmployeesResponse {
  @ApiProperty({ type: [EmployeeResponse] })
  items!: EmployeeResponse[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({ example: 7 })
  total!: number;
}

/** A candidate for linking an existing account to a new employee profile. */
export class LinkableUserOption {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "email" })
  email!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;
}

export class EmployeeDepartmentOption {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;
}

/** Options for the registration/edit form's selects, from existing records. */
export class EmployeeOptionsResponse {
  @ApiProperty({ type: [EmployeeDepartmentOption] })
  departments!: EmployeeDepartmentOption[];

  @ApiProperty({ enum: EmploymentType, isArray: true })
  employmentTypes!: EmploymentType[];

  @ApiProperty({ enum: EmploymentStatus, isArray: true })
  employmentStatuses!: EmploymentStatus[];

  @ApiProperty({ enum: EmployeeGender, isArray: true })
  genders!: EmployeeGender[];
}
