import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

import { MeetingParticipantResponse } from "../../generated/prisma/client.js";

export const MEETING_RESPONSE_ACKNOWLEDGEMENTS = [
  MeetingParticipantResponse.ACCEPTED,
  MeetingParticipantResponse.DECLINED,
] as const;

export class RespondToMeetingDto {
  @ApiProperty({ enum: MEETING_RESPONSE_ACKNOWLEDGEMENTS })
  @IsIn(MEETING_RESPONSE_ACKNOWLEDGEMENTS)
  response!: (typeof MEETING_RESPONSE_ACKNOWLEDGEMENTS)[number];
}
