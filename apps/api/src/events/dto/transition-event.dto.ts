import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";

import { EventStatus } from "../../generated/prisma/client.js";

export class TransitionEventDto {
  @ApiProperty({
    enum: EventStatus,
    description:
      "The lifecycle state to move to. Must be reachable from the current state under the approved graph.",
  })
  @IsEnum(EventStatus)
  status!: EventStatus;
}
