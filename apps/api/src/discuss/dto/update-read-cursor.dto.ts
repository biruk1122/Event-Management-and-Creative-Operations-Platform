import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class UpdateReadCursorDto {
  @ApiProperty({
    format: "uuid",
    description: "The most recent message the caller has read.",
  })
  @IsUUID()
  messageId!: string;
}
