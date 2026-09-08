import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

import { WorkspaceKind } from "../../generated/prisma/client.js";

/**
 * `kind` is required: authorization for a list depends on the module read key
 * for that kind, and there is no single cross-kind read key in the catalog.
 */
export class ListWorkspacesQueryDto {
  @ApiProperty({
    enum: WorkspaceKind,
    description: "List workspaces of this kind only. Required.",
  })
  @IsEnum(WorkspaceKind)
  kind!: WorkspaceKind;

  @ApiPropertyOptional({
    format: "uuid",
    description: "Restrict the list to workspaces managed by this user.",
  })
  @IsOptional()
  @IsUUID()
  managerId?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}
