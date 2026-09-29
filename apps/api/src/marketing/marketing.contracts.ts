import { ApiProperty } from "@nestjs/swagger";

export class MarketingStrategyResponse {
  @ApiProperty({ format: "uuid" })
  campaignId!: string;

  @ApiProperty({
    example: "Reach local audiences through partner-led campaigns.",
  })
  strategy!: string;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}
