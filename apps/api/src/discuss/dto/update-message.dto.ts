import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class UpdateMessageDto {
  @ApiProperty({ maxLength: 8000 })
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  @Matches(/\S/, { message: "content must not be blank" })
  content!: string;
}
