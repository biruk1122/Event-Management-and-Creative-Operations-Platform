import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import {
  EmploymentStatus,
  EmploymentType,
} from "../../generated/prisma/client.js";

export const EMPLOYEE_SORT_FIELDS = [
  "name",
  "employeeCode",
  "employmentDate",
  "department",
  "status",
] as const;
export type EmployeeSortField = (typeof EMPLOYEE_SORT_FIELDS)[number];

export class ListEmployeesQueryDto {
  @ApiPropertyOptional({
    description:
      "Matches name, employee ID, email, personal phone, or company phone.",
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  position?: string;

  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional({ enum: EmploymentStatus })
  @IsOptional()
  @IsEnum(EmploymentStatus)
  employmentStatus?: EmploymentStatus;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  workLocation?: string;

  @ApiPropertyOptional({ enum: EMPLOYEE_SORT_FIELDS, default: "name" })
  @IsOptional()
  @IsIn(EMPLOYEE_SORT_FIELDS)
  sort: EmployeeSortField = "name";

  @ApiPropertyOptional({ enum: ["asc", "desc"], default: "asc" })
  @IsOptional()
  @IsIn(["asc", "desc"])
  direction: "asc" | "desc" = "asc";

  @ApiPropertyOptional({ minimum: 1, maximum: 100000, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}
