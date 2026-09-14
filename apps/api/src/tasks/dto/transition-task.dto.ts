import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";

import { TaskStatus } from "../../generated/prisma/client.js";

export class TransitionTaskDto {
  @ApiProperty({
    enum: [
      TaskStatus.TODO,
      TaskStatus.IN_PROGRESS,
      TaskStatus.BLOCKED,
      TaskStatus.CANCELLED,
    ],
  })
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}
