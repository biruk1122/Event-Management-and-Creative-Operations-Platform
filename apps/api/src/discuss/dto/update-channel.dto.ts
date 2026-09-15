import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import { ChannelVisibility } from "../../generated/prisma/client.js";

export class UpdateChannelDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/, { message: "name must not be blank" })
  name?: string;

  @ApiPropertyOptional({ enum: ChannelVisibility })
  @IsOptional()
  @IsEnum(ChannelVisibility)
  visibility?: ChannelVisibility;
}
