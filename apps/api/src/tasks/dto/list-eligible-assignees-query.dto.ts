import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class ListEligibleAssigneesQueryDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  departmentId!: string;
}
