import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import { ChannelVisibility } from "../../generated/prisma/client.js";

export class CreateChannelDto {
  @ApiProperty({
    example: "Autumn Gala planning",
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/, { message: "name must not be blank" })
  name!: string;

  @ApiProperty({ enum: ChannelVisibility })
  @IsEnum(ChannelVisibility)
  visibility!: ChannelVisibility;

  @ApiPropertyOptional({
    format: "uuid",
    description: "At most one of workspaceId/departmentId/teamId may be set.",
  })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  teamId?: string;
}
