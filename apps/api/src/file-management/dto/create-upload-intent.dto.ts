import { Type } from "class-transformer";
import { IsIn, IsInt, IsString, Max, MaxLength, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

import { SUPPORTED_MEDIA_TYPES } from "../file-verification.service.js";

export class CreateUploadIntentDto {
  @ApiProperty({ example: "call-sheet.pdf", maxLength: 255 })
  @IsString()
  @MaxLength(255)
  filename!: string;

  @ApiProperty({ enum: SUPPORTED_MEDIA_TYPES, example: "application/pdf" })
  @IsString()
  @IsIn(SUPPORTED_MEDIA_TYPES)
  mediaType!: string;

  @ApiProperty({ example: 1048576, minimum: 1, maximum: 10 * 1024 * 1024 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  sizeBytes!: number;
}
