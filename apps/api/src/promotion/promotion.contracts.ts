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

export class PromotionActivityResponse {
  @ApiProperty({ type: CampaignActivityResponse })
  activity!: CampaignActivityResponse;

  @ApiProperty({ enum: PromotionChannel })
  channel!: PromotionChannel;

  @ApiProperty({ type: [PromotionTalentResponse] })
  talents!: PromotionTalentResponse[];
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
