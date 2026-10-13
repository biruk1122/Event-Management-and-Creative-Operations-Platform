import { ApiProperty } from "@nestjs/swagger";
import { IsDefined, IsUUID, ValidateIf } from "class-validator";

export class AssignUserRoleDto {
  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
    description:
      "The platform role to assign. Legacy null input is rejected; accounts must retain a role.",
  })
  @IsDefined()
  @ValidateIf((dto: AssignUserRoleDto) => dto.roleId !== null)
  @IsUUID()
  roleId!: string | null;
}
