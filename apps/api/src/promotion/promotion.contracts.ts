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
