import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from "class-validator";

import { ReportStatus, ReportType } from "../../generated/prisma/client.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ListReportsQueryDto {
  @ApiPropertyOptional({ enum: ReportType })
  @IsOptional()
  @IsEnum(ReportType)
  type?: ReportType;
  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  authorId?: string;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  departmentId?: string;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;
  @ApiPropertyOptional({
    format: "date",
    description: "Inclusive lower bound on period start; requires periodTo.",
  })
  @IsOptional()
  @Matches(DATE)
  periodFrom?: string;
  @ApiPropertyOptional({
    format: "date",
    description:
      "Inclusive upper bound on period start; requires periodFrom and may be at most 366 days after it.",
  })
  @IsOptional()
  @Matches(DATE)
  periodTo?: string;
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
