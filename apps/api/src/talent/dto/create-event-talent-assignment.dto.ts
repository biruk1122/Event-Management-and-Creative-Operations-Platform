import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

const NOT_BLANK = /\S/;

export class CreateEventTalentAssignmentDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  eventId!: string;

  @ApiProperty({ example: "Headliner", minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "role must not be blank" })
  role!: string;
}
