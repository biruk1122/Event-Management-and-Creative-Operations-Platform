import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";

import { PromotionChannel } from "../generated/prisma/client.js";

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
