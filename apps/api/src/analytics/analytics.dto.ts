import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
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
import { CampaignType } from "../generated/prisma/client.js";

export class AnalyticsPeriodDto {
  @ApiProperty({
    format: "date",
    description: "Inclusive UTC date (YYYY-MM-DD).",
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;
  @ApiProperty({
    format: "date",
    description: "Exclusive UTC date, at most 366 days after from.",
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  toExclusive!: string;
}
export class AnalyticsPageDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 10001, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10001)
  page = 1;
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}
export class DepartmentAnalyticsDto extends AnalyticsPeriodDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 10001, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10001)
  page = 1;
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}
export class EmployeeAnalyticsDto extends AnalyticsPeriodDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 10001, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10001)
  page = 1;
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
export class EventAnalyticsDto extends AnalyticsPageDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  eventId?: string;
}
export class CampaignAnalyticsDto extends AnalyticsPageDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  campaignId?: string;
  @ApiPropertyOptional({ enum: CampaignType, default: CampaignType.MARKETING })
  @IsOptional()
  @IsEnum(CampaignType)
  campaignType: CampaignType = CampaignType.MARKETING;
}
export class PromotionAnalyticsDto {
  @ApiProperty({
    format: "uuid",
    description: "One promotion campaign; results group by delivery channel.",
  })
  @IsUUID()
  campaignId!: string;
}
