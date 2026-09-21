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

import {
  TalentAvailability,
  TalentType,
} from "../../generated/prisma/client.js";

export class ListTalentsQueryDto {
  @ApiPropertyOptional({ enum: TalentType })
  @IsOptional()
  @IsEnum(TalentType)
  type?: TalentType;

  @ApiPropertyOptional({ enum: TalentAvailability })
  @IsOptional()
  @IsEnum(TalentAvailability)
  availability?: TalentAvailability;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  managerId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

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
