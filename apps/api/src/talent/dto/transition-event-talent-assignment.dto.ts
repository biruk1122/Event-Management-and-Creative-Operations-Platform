import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";

import { TalentAssignmentStatus } from "../../generated/prisma/client.js";

export class TransitionEventTalentAssignmentDto {
  @ApiProperty({ enum: TalentAssignmentStatus })
  @IsEnum(TalentAssignmentStatus)
  status!: TalentAssignmentStatus;
}
