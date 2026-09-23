import { ApiProperty } from "@nestjs/swagger";
import { IsUUID, ValidateIf } from "class-validator";
export class AssignProductionManagerDto {
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  managerId!: string | null;
}
