import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

import { MeetingStatus } from "../../generated/prisma/client.js";

export const MEETING_TERMINAL_STATUSES = [
  MeetingStatus.COMPLETED,
  MeetingStatus.CANCELLED,
] as const;

export class TransitionMeetingDto {
  @ApiProperty({ enum: MEETING_TERMINAL_STATUSES })
  @IsIn(MEETING_TERMINAL_STATUSES)
  status!: (typeof MEETING_TERMINAL_STATUSES)[number];
}
