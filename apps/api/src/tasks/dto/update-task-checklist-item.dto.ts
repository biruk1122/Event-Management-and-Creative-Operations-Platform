import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateTaskChecklistItemDto {
  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  @Matches(/\S/, { message: "description must not be blank" })
  description!: string;
}

export class ReorderTaskChecklistItemsDto {
  @ApiProperty({
    type: String,
    isArray: true,
    format: "uuid",
    description:
      "Every one of this task's current checklist item ids, in the desired order.",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  orderedItemIds!: string[];
}
