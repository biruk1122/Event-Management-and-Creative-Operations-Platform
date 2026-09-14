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

export class CreateTaskCommentDto {
  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  @Matches(/\S/, { message: "content must not be blank" })
  content!: string;

  @ApiPropertyOptional({ type: String, isArray: true, format: "uuid" })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  mentionedUserIds?: string[];
}
