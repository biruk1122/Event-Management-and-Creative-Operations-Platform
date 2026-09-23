import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";
export class AssignProductionTalentDto {
  @ApiProperty({ example: "Lead performer", maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/\S/)
  role!: string;
}
