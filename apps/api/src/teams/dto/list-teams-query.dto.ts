import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";

/** Activity filter for the list. ACTIVE = no deactivation marker set. */
export enum TeamActivityFilter {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}

export class ListTeamsQueryDto {
  @ApiPropertyOptional({ enum: TeamActivityFilter })
  @IsOptional()
  @IsEnum(TeamActivityFilter)
  status?: TeamActivityFilter;

  @ApiPropertyOptional({
    description: "Case-insensitive match against name and description.",
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({
    format: "uuid",
    description: "Restrict the list to teams owned by this department.",
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}
