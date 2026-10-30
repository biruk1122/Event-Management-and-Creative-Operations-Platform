import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

export class ToggleTaskChecklistItemDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  completed!: boolean;
}
