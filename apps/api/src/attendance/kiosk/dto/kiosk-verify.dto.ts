import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsUUID, MinLength } from "class-validator";

export class KioskVerifyDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  employeeId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;
}
