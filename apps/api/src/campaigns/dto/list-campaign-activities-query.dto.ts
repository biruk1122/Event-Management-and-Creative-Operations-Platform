import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";

import { CampaignActivityStatus } from "../../generated/prisma/client.js";

export class ListCampaignActivitiesQueryDto {
  @ApiPropertyOptional({ enum: CampaignActivityStatus })
  @IsOptional()
  @IsEnum(CampaignActivityStatus)
  status?: CampaignActivityStatus;

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
