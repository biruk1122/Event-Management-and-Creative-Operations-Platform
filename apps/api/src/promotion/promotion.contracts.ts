import { ApiProperty } from "@nestjs/swagger";

import { PromotionChannel } from "../generated/prisma/client.js";
import { CampaignActivityResponse } from "../campaigns/campaigns.contracts.js";

export class PromotionTalentResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  talentId!: string;

  @ApiProperty()
  role!: string;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}

/** An employee working a promotion activity (EVE-231). */
export class PromotionAssigneeResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "email" })
  email!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;
}

export class PromotionActivityResponse {
  @ApiProperty({ type: CampaignActivityResponse })
  activity!: CampaignActivityResponse;

  @ApiProperty({ enum: PromotionChannel })
  channel!: PromotionChannel;

  @ApiProperty({ type: [PromotionTalentResponse] })
  talents!: PromotionTalentResponse[];

  @ApiProperty({ type: String, nullable: true, maxLength: 500 })
  location!: string | null;

  @ApiProperty({ type: String, nullable: true, maxLength: 2000 })
  requiredResources!: string | null;

  @ApiProperty({ type: [PromotionAssigneeResponse] })
  assignees!: PromotionAssigneeResponse[];
}

export class PaginatedAssignableEmployeesResponse {
  @ApiProperty({ type: [PromotionAssigneeResponse] })
  items!: PromotionAssigneeResponse[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 100 })
  pageSize!: number;

  @ApiProperty({ example: 42 })
  total!: number;
}

/** One activity in the cross-campaign list, with the campaign it belongs to. */
export class PromotionActivityListItemResponse extends PromotionActivityResponse {
  @ApiProperty({ format: "uuid" })
  campaignId!: string;

  @ApiProperty()
  campaignName!: string;
}

export class PaginatedPromotionActivityListResponse {
  @ApiProperty({ type: [PromotionActivityListItemResponse] })
  items!: PromotionActivityListItemResponse[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({ example: 4 })
  total!: number;
}

export class PaginatedPromotionActivitiesResponse {
  @ApiProperty({ type: [PromotionActivityResponse] })
  items!: PromotionActivityResponse[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({ example: 4 })
  total!: number;
}

/** A promotion campaign linked to an event, as the caller can see it. */
export class PromotionEventCampaignResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ example: "ACTIVE" })
  status!: string;
}

/**
 * EVE-234: an upcoming event as a read-only promotion summary. Full event
 * details and every change stay with the event's own department and the
 * existing `event.read`/`event.update` rules.
 */
export class PromotionEventResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ example: "CONCERT" })
  eventType!: string;

  @ApiProperty({ example: "PLANNING" })
  status!: string;

  @ApiProperty({ format: "date-time" })
  startAt!: string;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  endAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  location!: string | null;

  @ApiProperty({ type: String, nullable: true })
  organizerName!: string | null;

  @ApiProperty({ type: String, nullable: true, example: "Event Office" })
  departmentName!: string | null;

  @ApiProperty({ type: [PromotionEventCampaignResponse] })
  campaigns!: PromotionEventCampaignResponse[];
}

export class PaginatedPromotionEventsResponse {
  @ApiProperty({ type: [PromotionEventResponse] })
  items!: PromotionEventResponse[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({ example: 4 })
  total!: number;
}

export class PromotionStatusCount {
  @ApiProperty({ example: "ACTIVE" })
  status!: string;

  @ApiProperty({ example: 3 })
  count!: number;
}

/** Budget totals in one currency, summed over the readable promotion campaigns. */
export class PromotionBudgetTotal {
  @ApiProperty({ example: "ETB" })
  currency!: string;

  @ApiProperty({ example: "50000.00" })
  allocated!: string;

  @ApiProperty({ example: "9800.00", description: "Approved expenses." })
  approved!: string;

  @ApiProperty({ example: "1350.00", description: "Awaiting approval." })
  pending!: string;

  @ApiProperty({ example: 2 })
  campaignCount!: number;

  @ApiProperty({ example: 0 })
  overBudgetCount!: number;
}

/** The latest recorded value of one indicator, summed across campaigns. */
export class PromotionMetricTotal {
  @ApiProperty({ example: "REACH" })
  key!: string;

  @ApiProperty({ example: "125000.00" })
  value!: string;

  @ApiProperty({ example: 2, description: "Campaigns that recorded it." })
  campaignCount!: number;
}

/**
 * EVE-234: the Promotion overview. Every figure is counted from recorded
 * data the caller can read; a section the caller cannot read is `null`.
 */
export class PromotionOverviewResponse {
  @ApiProperty({ example: 6 })
  totalCampaigns!: number;

  @ApiProperty({ type: [PromotionStatusCount] })
  campaignsByStatus!: PromotionStatusCount[];

  @ApiProperty({ example: 2 })
  upcomingEventCount!: number;

  @ApiProperty({ type: [PromotionEventResponse] })
  nextEvents!: PromotionEventResponse[];

  @ApiProperty({ type: [PromotionStatusCount], nullable: true })
  partnershipsByStatus!: PromotionStatusCount[] | null;

  @ApiProperty({ type: [PromotionBudgetTotal], nullable: true })
  budget!: PromotionBudgetTotal[] | null;

  @ApiProperty({ type: [PromotionMetricTotal] })
  performance!: PromotionMetricTotal[];
}
