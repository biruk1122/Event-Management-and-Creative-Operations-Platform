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

export class TalentResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Amina Tesfaye" })
  fullName!: string;

  @ApiProperty({ enum: TalentType })
  type!: TalentType;

  @ApiProperty({ format: "uuid", nullable: true })
  profileImageId!: string | null;

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
