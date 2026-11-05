import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

import { TalentAssignmentStatus } from "../../generated/prisma/client.js";

export class TransitionEventTalentAssignmentDto {
  @ApiProperty({ enum: TalentAssignmentStatus })
  @IsEnum(TalentAssignmentStatus)
  status!: TalentAssignmentStatus;

  /** Required when cancelling, enforced by the assignment service. */
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
