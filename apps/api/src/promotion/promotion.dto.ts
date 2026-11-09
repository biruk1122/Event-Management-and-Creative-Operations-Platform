import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";

import {
  CampaignActivityStatus,
  PromotionChannel,
} from "../generated/prisma/client.js";

export class PromotionTalentDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  talentId!: string;

  @ApiProperty({ example: "Presenter", maxLength: 200 })
  @IsString()
  @MaxLength(200)
  @Matches(/\S/, { message: "role must not be blank" })
  role!: string;
}

export class AttachPromotionActivityDto {
  @ApiProperty({ enum: PromotionChannel })
  @IsEnum(PromotionChannel)
  channel!: PromotionChannel;

  @ApiPropertyOptional({ type: [PromotionTalentDto], maxItems: 50 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PromotionTalentDto)
  talents?: PromotionTalentDto[];
}

export class UpdatePromotionChannelDto {
  @ApiProperty({ enum: PromotionChannel })
  @IsEnum(PromotionChannel)
  channel!: PromotionChannel;
}

export class AssignPromotionTalentDto extends PromotionTalentDto {}

/** Where an activity happens and what it needs. Send null to clear a field. */
export class UpdatePromotionDetailsDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(/\S/, { message: "location must not be blank" })
  location?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(/\S/, { message: "requiredResources must not be blank" })
  requiredResources?: string | null;
}

/** Active employees of the campaign's department who may be assigned (EVE-231). */
export class ListAssignableEmployeesQueryDto {
  @ApiPropertyOptional({
    maxLength: 200,
    description: "Matches name or email.",
  })
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

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 100;
}

export class ListPromotionActivitiesQueryDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiPropertyOptional({ enum: PromotionChannel })
  @IsOptional()
  @IsEnum(PromotionChannel)
  channel?: PromotionChannel;

  @ApiPropertyOptional({ enum: CampaignActivityStatus })
  @IsOptional()
  @IsEnum(CampaignActivityStatus)
  status?: CampaignActivityStatus;

  @ApiPropertyOptional({
    maxLength: 200,
    description: "Matches the activity name.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({
    format: "date-time",
    description: "Activities starting at or after this instant.",
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({
    format: "date-time",
    description: "Activities starting at or before this instant.",
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @ApiPropertyOptional({ enum: ["START_AT", "NAME"], default: "START_AT" })
  @IsOptional()
  @IsIn(["START_AT", "NAME"])
  sort: "START_AT" | "NAME" = "START_AT";

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

/** EVE-234: the read-only event schedule the Promotion team promotes. */
export class ListPromotionEventsQueryDto {
  @ApiPropertyOptional({
    format: "date-time",
    description:
      "Events still running at or after this instant. Defaults to now.",
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({
    format: "date-time",
    description: "Events starting at or before this instant.",
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @ApiPropertyOptional({
    maxLength: 200,
    description: "Matches the event name or location.",
  })
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
