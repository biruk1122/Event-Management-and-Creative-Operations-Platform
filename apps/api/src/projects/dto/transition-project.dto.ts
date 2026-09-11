import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";

import { ProjectStatus } from "../../generated/prisma/client.js";

export class TransitionProjectDto {
  @ApiProperty({
    enum: ProjectStatus,
    description:
      "The lifecycle state to move to. Must be reachable from the current state under the approved graph.",
  })
  @IsEnum(ProjectStatus)
  status!: ProjectStatus;
}
