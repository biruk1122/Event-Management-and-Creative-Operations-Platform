import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class AssignEmployeeDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  employeeId!: string;
}
