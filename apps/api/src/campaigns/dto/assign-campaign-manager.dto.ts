import { ApiProperty } from "@nestjs/swagger";
import { IsDefined, IsUUID, ValidateIf } from "class-validator";

export class AssignCampaignManagerDto {
  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
    description:
      "The user to set as the campaign manager on the connected workspace, or null to clear it.",
  })
  @IsDefined()
  @ValidateIf((dto: AssignCampaignManagerDto) => dto.managerId !== null)
  @IsUUID()
  managerId!: string | null;
}
