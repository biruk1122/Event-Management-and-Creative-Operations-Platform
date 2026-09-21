import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";

import { TalentAvailability } from "../../generated/prisma/client.js";

export class TransitionTalentDto {
  @ApiProperty({ enum: TalentAvailability })
  @IsEnum(TalentAvailability)
  availability!: TalentAvailability;
}
