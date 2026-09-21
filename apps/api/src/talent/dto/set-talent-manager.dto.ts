import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";

export class SetTalentManagerDto {
  @ApiProperty({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  managerId!: string | null;
}
