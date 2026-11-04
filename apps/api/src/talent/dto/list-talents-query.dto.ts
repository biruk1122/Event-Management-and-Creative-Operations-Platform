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

  /** "assigned" keeps talent with an active assignment; "unassigned" keeps the rest. */
  @ApiPropertyOptional({ enum: ["assigned", "unassigned"] })
  @IsOptional()
  @IsIn(["assigned", "unassigned"])
  assignment?: "assigned" | "unassigned";

  @ApiPropertyOptional({
    enum: ["name", "newest", "availability"],
  })
  @IsOptional()
  @IsIn(["name", "newest", "availability"])
  sort?: "name" | "newest" | "availability";

  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}
