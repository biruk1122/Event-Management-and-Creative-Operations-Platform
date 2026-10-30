import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateTaskChecklistItemDto {
  @ApiProperty({ example: "Confirm venue permits", maxLength: 300 })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  @Matches(/\S/, { message: "description must not be blank" })
  description!: string;
}
