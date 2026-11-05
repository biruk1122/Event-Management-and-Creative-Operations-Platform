import { ApiProperty } from "@nestjs/swagger";

import {
  TalentAssignmentStatus,
  TalentAvailability,
  TalentType,
} from "../generated/prisma/client.js";

export class TalentUserSummary {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "email" })
  email!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;
}

export class TalentSocialLinkResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Instagram" })
  label!: string;

  @ApiProperty({ format: "uri" })
  url!: string;
}

export class TalentScheduleResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Dress rehearsal" })
  title!: string;

  @ApiProperty({ format: "date-time" })
  startAt!: string;

  @ApiProperty({ format: "date-time" })
  endAt!: string;
}

export class TalentEventSummary {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Autumn Product Launch" })
  name!: string;
}

export class TalentEventAssignmentResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: TalentEventSummary })
  event!: TalentEventSummary;

  @ApiProperty({ example: "Headliner" })
  role!: string;

  @ApiProperty({ enum: TalentAssignmentStatus })
  status!: TalentAssignmentStatus;

  @ApiProperty({ format: "date-time" })
  assignedAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

/** The assignment a talent is most relevantly engaged in now: active first, then the next upcoming. */
export class TalentCurrentAssignmentResponse {
  @ApiProperty({ enum: ["EVENT", "PRODUCTION", "PROMOTION"] })
  kind!: "EVENT" | "PRODUCTION" | "PROMOTION";

  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  workName!: string;

  @ApiProperty({ format: "date-time", nullable: true, type: String })
  startAt!: string | null;

  @ApiProperty({ format: "date-time", nullable: true, type: String })
  endAt!: string | null;

  @ApiProperty({ enum: ["upcoming", "active"] })
  phase!: "upcoming" | "active";
}

export class TalentResponse {
  @ApiProperty({
    description:
      "Assignments still active (ASSIGNED) across events, productions, and promotional activities.",
  })
  activeAssignmentCount!: number;

  @ApiProperty({ type: TalentCurrentAssignmentResponse, nullable: true })
  currentAssignment!: TalentCurrentAssignmentResponse | null;

  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Amina Tesfaye" })
  fullName!: string;

  @ApiProperty({ enum: TalentType })
  type!: TalentType;

  @ApiProperty({ format: "uuid", nullable: true })
  profileImageId!: string | null;

  /** Where to load the profile photo, through the API. Null when there is no photo. */
  @ApiProperty({ type: String, nullable: true })
  profileImageUrl!: string | null;

  @ApiProperty({ type: String, nullable: true, format: "email" })
  email!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  biography!: string | null;

  @ApiProperty({ enum: TalentAvailability })
  availability!: TalentAvailability;

  @ApiProperty({ type: TalentUserSummary, nullable: true })
  manager!: TalentUserSummary | null;

  @ApiProperty({ type: [TalentSocialLinkResponse] })
  socialLinks!: TalentSocialLinkResponse[];

  @ApiProperty({ type: [TalentScheduleResponse] })
  schedules!: TalentScheduleResponse[];

  @ApiProperty({ type: [TalentEventAssignmentResponse] })
  eventAssignments!: TalentEventAssignmentResponse[];

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

export class PaginatedTalentsResponse {
  @ApiProperty({ type: [TalentResponse] })
  items!: TalentResponse[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({ example: 7 })
  total!: number;
}

export class TalentSummaryResponse {
  @ApiProperty({ description: "Talent profiles in the directory." })
  total!: number;

  @ApiProperty({
    description: "Talent profiles by availability state.",
    type: "object",
    additionalProperties: { type: "integer" },
  })
  byAvailability!: {
    AVAILABLE: number;
    ASSIGNED: number;
    UNAVAILABLE: number;
    INACTIVE: number;
  };

  @ApiProperty({
    description: "Talent profiles with at least one active assignment.",
  })
  assignedTalents!: number;

  @ApiProperty({
    description:
      "Active assignments across events, productions, and promotional activities.",
  })
  activeAssignments!: number;
}
