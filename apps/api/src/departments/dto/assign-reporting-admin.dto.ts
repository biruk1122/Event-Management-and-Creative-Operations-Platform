import { ApiProperty } from "@nestjs/swagger";
import { IsDefined, IsUUID, ValidateIf } from "class-validator";

export class AssignReportingAdminDto {
  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description:
      "The Admin to designate as this department's reporting recipient, or null to clear it.",
  })
  @IsDefined()
  @ValidateIf((dto: AssignReportingAdminDto) => dto.userId !== null)
  @IsUUID()
  userId!: string | null;
}
