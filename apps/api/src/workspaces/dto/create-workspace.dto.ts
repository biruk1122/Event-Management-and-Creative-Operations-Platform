import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsUUID } from "class-validator";

import { WorkspaceKind } from "../../generated/prisma/client.js";

export class CreateWorkspaceDto {
  @ApiProperty({
    enum: WorkspaceKind,
    description:
      "Which module owns this workspace. Fixed once set; there is no route to change it.",
  })
  @IsEnum(WorkspaceKind)
  kind!: WorkspaceKind;

  @ApiPropertyOptional({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
    description: "Assign this user as the workspace manager on creation.",
  })
  @IsOptional()
  @IsUUID()
  managerId?: string;
}
