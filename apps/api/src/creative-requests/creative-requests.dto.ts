import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
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
} from "class-validator";

import {
  CreativeAssetType,
  CreativeRequestFileKind,
  CreativeRequestStatus,
} from "../generated/prisma/client.js";
import { CreateUploadIntentDto } from "../file-management/dto/create-upload-intent.dto.js";

/** Rejects a value that is empty once trimmed. */
const NOT_BLANK = /\S/;

export class CreateCreativeRequestDto {
  @ApiProperty({ example: "Festival poster", minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "title must not be blank" })
  title!: string;

  @ApiProperty({ enum: CreativeAssetType })
  @IsEnum(CreativeAssetType)
  assetType!: CreativeAssetType;

  @ApiProperty({
    description: "What the creative work must contain, its sizes and formats.",
    minLength: 1,
    maxLength: 5000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  @Matches(NOT_BLANK, { message: "requirements must not be blank" })
  requirements!: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  dueAt?: string;

  @ApiPropertyOptional({
    format: "uuid",
    description: "A campaign of the requesting department.",
  })
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  eventId?: string;
}

export class ListCreativeRequestsQueryDto {
  @ApiPropertyOptional({ enum: CreativeRequestStatus })
  @IsOptional()
  @IsEnum(CreativeRequestStatus)
  status?: CreativeRequestStatus;

  @ApiPropertyOptional({
    enum: ["SENT", "RECEIVED"],
    description:
      "SENT: requests your department sent. RECEIVED: requests sent to your department.",
  })
  @IsOptional()
  @IsIn(["SENT", "RECEIVED"])
  direction?: "SENT" | "RECEIVED";

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiPropertyOptional({ maxLength: 200, description: "Matches the title." })
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

export class DeclineCreativeRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(NOT_BLANK, { message: "reason must not be blank" })
  reason!: string;
}

export class ReviewCreativeRequestDto {
  @ApiProperty({ enum: ["APPROVED", "CHANGES_REQUESTED"] })
  @IsIn(["APPROVED", "CHANGES_REQUESTED"])
  outcome!: "APPROVED" | "CHANGES_REQUESTED";

  @ApiPropertyOptional({
    maxLength: 5000,
    description: "Required when asking for changes. Added to the feedback log.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string;
}

export class CreateCreativeRequestFeedbackDto {
  @ApiProperty({ minLength: 1, maxLength: 5000 })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  @Matches(NOT_BLANK, { message: "note must not be blank" })
  note!: string;
}

export class ListCreativeRequestFeedbackQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 50;
}

/** An upload declaration plus what the file is for. */
export class CreateCreativeRequestUploadIntentDto extends CreateUploadIntentDto {
  @ApiProperty({ enum: CreativeRequestFileKind })
  @IsEnum(CreativeRequestFileKind)
  kind!: CreativeRequestFileKind;
}

export class FinalizeCreativeRequestUploadDto {
  @ApiProperty({ enum: CreativeRequestFileKind })
  @IsEnum(CreativeRequestFileKind)
  kind!: CreativeRequestFileKind;
}
