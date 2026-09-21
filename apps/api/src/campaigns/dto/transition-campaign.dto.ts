import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";

import { CampaignStatus } from "../../generated/prisma/client.js";

export class TransitionCampaignDto {
  @ApiProperty({
    enum: CampaignStatus,
    description:
      "The lifecycle state to move to. Must be reachable from the current state under the approved graph.",
  })
  @IsEnum(CampaignStatus)
  status!: CampaignStatus;
}
