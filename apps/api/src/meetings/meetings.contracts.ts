import { ApiProperty } from "@nestjs/swagger";

import {
  MeetingParticipantResponse,
  MeetingStatus,
  MeetingType,
} from "../generated/prisma/client.js";

export class MeetingPersonSummary {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "email" }) email!: string;
  @ApiProperty({ type: String, nullable: true }) firstName!: string | null;
  @ApiProperty({ type: String, nullable: true }) lastName!: string | null;
}

export class MeetingParticipantResponseContract extends MeetingPersonSummary {
  @ApiProperty({ enum: MeetingParticipantResponse })
  response!: MeetingParticipantResponse;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  respondedAt!: string | null;

  @ApiProperty({ format: "date-time" })
  invitedAt!: string;
}

export class MeetingResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ type: String, format: "uuid", nullable: true }) workspaceId!:
    string | null;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: MeetingType }) type!: MeetingType;
  @ApiProperty({ enum: MeetingStatus }) status!: MeetingStatus;
  @ApiProperty({ type: MeetingPersonSummary }) organizer!: MeetingPersonSummary;
  @ApiProperty({ format: "date-time" }) startAt!: string;
  @ApiProperty({ format: "date-time" }) endAt!: string;
  @ApiProperty({ type: String, nullable: true }) location!: string | null;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  reminderAt!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "Plain text, set by the organizer.",
  })
  agenda!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "Plain text, recorded once the meeting has happened.",
  })
  minutes!: string | null;
  @ApiProperty({ type: [MeetingParticipantResponseContract] })
  participants!: MeetingParticipantResponseContract[];
  @ApiProperty({ format: "date-time" }) createdAt!: string;
  @ApiProperty({ format: "date-time" }) updatedAt!: string;
}

export class PaginatedMeetingsResponse {
  @ApiProperty({ type: [MeetingResponse] }) items!: MeetingResponse[];
  @ApiProperty({ minimum: 1 }) page!: number;
  @ApiProperty({ minimum: 1 }) pageSize!: number;
  @ApiProperty({ minimum: 0 }) total!: number;
}

export class MeetingAcknowledgementResponse {
  @ApiProperty({ format: "uuid" }) meetingId!: string;
  @ApiProperty({ enum: MeetingParticipantResponse })
  response!: MeetingParticipantResponse;
  @ApiProperty({ format: "date-time" }) respondedAt!: string;
}

export class UserAvailabilityResponse {
  @ApiProperty({ format: "uuid" }) userId!: string;
  @ApiProperty() available!: boolean;
  @ApiProperty({ minimum: 0 }) conflictingMeetingCount!: number;
}

export class MeetingAvailabilityResponse {
  @ApiProperty({ format: "date-time" }) startAt!: string;
  @ApiProperty({ format: "date-time" }) endAt!: string;
  @ApiProperty({ type: [UserAvailabilityResponse] })
  users!: UserAvailabilityResponse[];
}

export class MeetingJitsiSessionResponse {
  @ApiProperty({
    description: "The self-hosted Jitsi deployment's public domain.",
  })
  domain!: string;
  @ApiProperty() roomName!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({
    description:
      "UI hint only in this MVP - no JWT/server-enforced moderator role yet.",
  })
  moderator!: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "Reserved for the optional future JWT auth scheme.",
  })
  jwt!: string | null;
}
