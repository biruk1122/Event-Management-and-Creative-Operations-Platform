import { ApiProperty } from "@nestjs/swagger";

import {
  CreativeAssetType,
  CreativeRequestFileKind,
  CreativeRequestStatus,
} from "../generated/prisma/client.js";
import { ManagedFileResponse } from "../file-management/file-management.contracts.js";

export class CreativeRequestPersonSummary {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "email" })
  email!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;
}

export class CreativeRequestDepartmentSummary {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Production" })
  name!: string;
}

export class CreativeRequestLinkSummary {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class CreativeRequestTaskSummary {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  title!: string;
}

/** What the caller may do next, as hints for the interface. The API still
 * checks every action. */
export class CreativeRequestAbilities {
  @ApiProperty({
    enum: CreativeRequestStatus,
    isArray: true,
    description: "Statuses the caller may move this request to.",
  })
  moves!: CreativeRequestStatus[];

  @ApiProperty()
  canAddFeedback!: boolean;

  @ApiProperty({ enum: CreativeRequestFileKind, isArray: true })
  canAttach!: CreativeRequestFileKind[];

  @ApiProperty({ description: "True when the caller only oversees it." })
  readOnly!: boolean;
}

/** A creative request from one department to another (EVE-232). */
export class CreativeRequestResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Festival poster" })
  title!: string;

  @ApiProperty({ enum: CreativeAssetType })
  assetType!: CreativeAssetType;

  @ApiProperty()
  requirements!: string;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  dueAt!: string | null;

  @ApiProperty({ enum: CreativeRequestStatus })
  status!: CreativeRequestStatus;

  @ApiProperty({ type: CreativeRequestDepartmentSummary })
  requestingDepartment!: CreativeRequestDepartmentSummary;

  @ApiProperty({ type: CreativeRequestDepartmentSummary })
  targetDepartment!: CreativeRequestDepartmentSummary;

  @ApiProperty({ type: CreativeRequestLinkSummary, nullable: true })
  campaign!: CreativeRequestLinkSummary | null;

  @ApiProperty({ type: CreativeRequestLinkSummary, nullable: true })
  event!: CreativeRequestLinkSummary | null;

  @ApiProperty({
    type: CreativeRequestTaskSummary,
    nullable: true,
    description: "The CREATIVE task created when the request was accepted.",
  })
  task!: CreativeRequestTaskSummary | null;

  @ApiProperty({ type: CreativeRequestPersonSummary, nullable: true })
  requestedBy!: CreativeRequestPersonSummary | null;

  @ApiProperty({ type: String, nullable: true })
  declineReason!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  respondedAt!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  deliveredAt!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  reviewedAt!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;

  @ApiProperty({ type: CreativeRequestAbilities })
  abilities!: CreativeRequestAbilities;
}

export class PaginatedCreativeRequestsResponse {
  @ApiProperty({ type: [CreativeRequestResponse] })
  items!: CreativeRequestResponse[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({ example: 3 })
  total!: number;
}

export class CreativeRequestFeedbackResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  creativeRequestId!: string;

  @ApiProperty({ type: CreativeRequestPersonSummary, nullable: true })
  author!: CreativeRequestPersonSummary | null;

  @ApiProperty()
  note!: string;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}

export class PaginatedCreativeRequestFeedbackResponse {
  @ApiProperty({ type: [CreativeRequestFeedbackResponse] })
  items!: CreativeRequestFeedbackResponse[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 50 })
  pageSize!: number;

  @ApiProperty({ example: 2 })
  total!: number;
}

export class CreativeRequestFileResponse extends ManagedFileResponse {
  @ApiProperty({ enum: CreativeRequestFileKind })
  kind!: CreativeRequestFileKind;
}

export class PaginatedCreativeRequestFilesResponse {
  @ApiProperty({ type: [CreativeRequestFileResponse] })
  items!: CreativeRequestFileResponse[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({ example: 2 })
  total!: number;
}
