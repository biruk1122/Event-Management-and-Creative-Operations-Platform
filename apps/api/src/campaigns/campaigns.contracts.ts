import { ApiProperty } from "@nestjs/swagger";

import {
  CampaignActivityStatus,
  CampaignStatus,
  CampaignType,
} from "../generated/prisma/client.js";

/** A user attached to a campaign through its connected workspace, or its author. */
export class CampaignPersonSummary {
  @ApiProperty({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  })
  id!: string;

  @ApiProperty({ format: "email", example: "dana.okafor@example.com" })
  email!: string;

  @ApiProperty({ type: String, nullable: true, example: "Dana" })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true, example: "Okafor" })
  lastName!: string | null;
}

/** A team assigned to a campaign through its connected workspace. */
export class CampaignTeamSummary {
  @ApiProperty({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  })
  id!: string;

  @ApiProperty({ example: "Marketing Team" })
  name!: string;
}

/**
 * Campaign progress derived from the campaign's own activities. This is the
 * minimal approved-for-now formula while OD-13 leaves the calculation open:
 * cancelled activities are excluded, and `percent` is the rounded share of the
 * remaining activities that are completed. Progress from connected tasks is
 * added by a later slice.
 */
export class CampaignProgress {
  @ApiProperty({
    example: 3,
    description: "Activities that are completed.",
  })
  completedActivities!: number;

  @ApiProperty({
    example: 8,
    description: "Activities that count toward progress (not cancelled).",
  })
  totalActivities!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 38,
    description:
      "Whole percent, 0-100. Null while no activity counts toward progress.",
  })
  percent!: number | null;
}

/**
 * Public view of a campaign and its connected workspace overview: the shared
 * operational context (the campaign manager, the assigned teams, and the
 * assigned employees) is read from the campaign's `Workspace` (WSP-01), never
 * re-modelled here. The budget is deliberately absent - it is sensitive
 * (PC-04) and is served only by the dedicated `/campaigns/{id}/budget` routes.
 */
export class CampaignResponse {
  @ApiProperty({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  })
  id!: string;

  @ApiProperty({
    format: "uuid",
    description:
      "The connected workspace that anchors this campaign's manager, teams, and participants.",
  })
  workspaceId!: string;

  @ApiProperty({ example: "Autumn Launch Push" })
  name!: string;

  @ApiProperty({
    enum: CampaignType,
    description: "The owning module: Marketing or Promotion.",
  })
  campaignType!: CampaignType;

  @ApiProperty({
    type: String,
    nullable: true,
    example: "Awareness push ahead of the launch.",
  })
  description!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: "Young adults in urban areas",
  })
  audience!: string | null;

  @ApiProperty({
    enum: CampaignStatus,
    description: "Current lifecycle state.",
  })
  status!: CampaignStatus;

  @ApiProperty({
    type: String,
    format: "date-time",
    nullable: true,
    description: "UTC start. Null while the campaign is not yet scheduled.",
  })
  startAt!: string | null;

  @ApiProperty({
    type: String,
    format: "date-time",
    nullable: true,
    description: "UTC end. Never before the start when both are set.",
  })
  endAt!: string | null;

  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description:
      "The event this campaign relates to. Mutually exclusive with `productName`.",
  })
  eventId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: "Nexo Energy Drink",
    description:
      "The product this campaign promotes. Mutually exclusive with `eventId`.",
  })
  productName!: string | null;

  @ApiProperty({ type: CampaignProgress })
  progress!: CampaignProgress;

  @ApiProperty({
    type: CampaignPersonSummary,
    nullable: true,
    description: "The campaign manager, from the connected workspace.",
  })
  manager!: CampaignPersonSummary | null;

  @ApiProperty({
    type: [CampaignTeamSummary],
    description:
      "Teams assigned to this campaign, from the connected workspace.",
  })
  teams!: CampaignTeamSummary[];

  @ApiProperty({
    type: [CampaignPersonSummary],
    description:
      "Employees assigned to this campaign individually, from the connected workspace.",
  })
  participants!: CampaignPersonSummary[];

  @ApiProperty({
    type: CampaignPersonSummary,
    nullable: true,
    description:
      "The user who created the campaign; null once that user is gone.",
  })
  createdBy!: CampaignPersonSummary | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

/** A page of campaigns for the administration and connected-workspace overview. */
export class PaginatedCampaignsResponse {
  @ApiProperty({ type: [CampaignResponse] })
  items!: CampaignResponse[];

  @ApiProperty({ example: 1, description: "1-based page number." })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({
    example: 7,
    description: "Total campaigns matching the filter.",
  })
  total!: number;
}

/**
 * A campaign budget. Sensitive (PC-04): served only through the budget routes,
 * which require `campaign.budget.read` / `campaign.budget.update`. Amount and
 * currency are always set together or both null.
 */
export class CampaignBudgetResponse {
  @ApiProperty({
    type: String,
    nullable: true,
    example: "25000.00",
    description:
      "Decimal string with two fraction digits. Null when no budget is set.",
  })
  amount!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: "ETB",
    description: "ISO-4217 alphabetic code. Null when no budget is set.",
  })
  currency!: string | null;
}

/** One planned unit of work owned by a campaign. */
export class CampaignActivityResponse {
  @ApiProperty({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  })
  id!: string;

  @ApiProperty({ format: "uuid" })
  campaignId!: string;

  @ApiProperty({ example: "Teaser video release" })
  name!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: "Publish the 30-second teaser across channels.",
  })
  description!: string | null;

  @ApiProperty({
    enum: CampaignActivityStatus,
    description:
      "Current state. The vocabulary defines no activity transition graph, so any state may be set.",
  })
  status!: CampaignActivityStatus;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  startAt!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  endAt!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

/** A page of one campaign's activities, ordered by schedule then creation. */
export class PaginatedCampaignActivitiesResponse {
  @ApiProperty({ type: [CampaignActivityResponse] })
  items!: CampaignActivityResponse[];

  @ApiProperty({ example: 1, description: "1-based page number." })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({
    example: 4,
    description: "Total activities matching the filter.",
  })
  total!: number;
}
