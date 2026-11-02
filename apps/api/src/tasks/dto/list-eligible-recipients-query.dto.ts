import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";

export class ListEligibleRecipientsQueryDto {
  @ApiPropertyOptional({
    format: "uuid",
    description:
      "The task's department; its own manager is then also a valid recipient.",
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}
