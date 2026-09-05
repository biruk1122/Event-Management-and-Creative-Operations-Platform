import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsString, Matches } from "class-validator";

import { PermissionScope } from "../../generated/prisma/enums.js";

/** The permission key format: lower-case, dot-separated `resource.action[.action]`. */
const PERMISSION_KEY_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export class AddRolePermissionDto {
  @ApiProperty({ example: "task.review" })
  @IsString()
  @Matches(PERMISSION_KEY_PATTERN)
  permissionKey!: string;

  @ApiProperty({ enum: PermissionScope, example: "ORGANIZATION" })
  @IsEnum(PermissionScope)
  scope!: PermissionScope;
}
