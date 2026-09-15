import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateMessageDto {
  @ApiProperty({ maxLength: 8000 })
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  @Matches(/\S/, { message: "content must not be blank" })
  content!: string;

  @ApiPropertyOptional({
    format: "uuid",
    description: "Makes this message an explicit reply.",
  })
  @IsOptional()
  @IsUUID()
  parentMessageId?: string;

  @ApiPropertyOptional({ type: String, isArray: true, format: "uuid" })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  mentionedUserIds?: string[];
}
