import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class DashboardQueryDto {
  @ApiPropertyOptional({
    description:
      "Comma-separated unique audience card keys; omitted means all.",
    maxLength: 1024,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  cards?: string;
  @ApiPropertyOptional({
    format: "date",
    description: "UTC day; defaults to current UTC date.",
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  day?: string;
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 10, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit = 5;
}
export class ManagementDashboardQueryDto extends DashboardQueryDto {
  @ApiPropertyOptional({ format: "date" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;
  @ApiPropertyOptional({
    format: "date",
    description: "Exclusive cohort bound, at most 366 days after from.",
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  toExclusive?: string;
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 12, default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  months = 3;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  promotionCampaignId?: string;
}
