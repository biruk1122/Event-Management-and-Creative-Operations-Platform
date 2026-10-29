import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsEnum, IsOptional, IsUUID } from "class-validator";

import { ShareScope } from "../../generated/prisma/client.js";

/**
 * Shares a letter or document with one employee or with every employee.
 * Exactly one of `recipientId`/`allEmployees` is required - validated in
 * `SharingService`, not here, since the error needs to name which rule was
 * violated (mirrors how `LettersService` validates direction/party pairing).
 */
export class CreateShareDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  recipientId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allEmployees?: boolean;

  @ApiPropertyOptional({ enum: ShareScope, default: ShareScope.VIEW })
  @IsOptional()
  @IsEnum(ShareScope)
  scope?: ShareScope;
}
