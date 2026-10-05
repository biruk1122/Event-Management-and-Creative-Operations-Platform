import { ApiProperty } from "@nestjs/swagger";
import { PromotionChannel } from "../generated/prisma/client.js";

export class AnalyticsMeta {
  @ApiProperty({
    format: "date-time",
    description: "Server refresh time, not a historical snapshot guarantee.",
  })
  asOf!: string;
  @ApiProperty({
    enum: ["live-current-state"],
    description: "Composed source reads may observe separate commits.",
  })
  freshness!: "live-current-state";
}
export class AnalyticsProgress {
  @ApiProperty({ type: Number, minimum: 0 }) total!: number;
  @ApiProperty({ type: Number, minimum: 0 }) completed!: number;
  @ApiProperty({ type: Number, nullable: true, minimum: 0, maximum: 100 })
  percent!: number | null;
}
export class AnalyticsWorkCounts extends AnalyticsProgress {
  @ApiProperty({ type: Number, minimum: 0 }) pending!: number;
  @ApiProperty({ type: Number, minimum: 0 }) overdue!: number;
}
export class TaskAnalyticsResponse extends AnalyticsMeta {
  @ApiProperty({ format: "date" }) from!: string;
  @ApiProperty({ format: "date" }) toExclusive!: string;
  @ApiProperty({ type: AnalyticsWorkCounts }) counts!: AnalyticsWorkCounts;
}
export class EntityWorkCounts extends AnalyticsWorkCounts {
  @ApiProperty({ format: "uuid" }) id!: string;
}
export class EntityProgress extends AnalyticsProgress {
  @ApiProperty({ format: "uuid" }) id!: string;
}
export class AnalyticsPageResponse extends AnalyticsMeta {
  @ApiProperty({ type: Number, minimum: 0 }) total!: number;
  @ApiProperty({ type: Number, minimum: 1 }) page!: number;
  @ApiProperty({ type: Number, minimum: 1, maximum: 100 }) pageSize!: number;
}
export class WorkAnalyticsPageResponse extends AnalyticsPageResponse {
  @ApiProperty({ format: "date" }) from!: string;
  @ApiProperty({ format: "date" }) toExclusive!: string;
  @ApiProperty({ type: [EntityWorkCounts] }) items!: EntityWorkCounts[];
}
export class ProgressAnalyticsPageResponse extends AnalyticsPageResponse {
  @ApiProperty({ type: [EntityProgress] }) items!: EntityProgress[];
}
export class PromotionChannelProgress extends AnalyticsProgress {
  @ApiProperty({ enum: PromotionChannel }) channel!: PromotionChannel;
}
export class PromotionAnalyticsResponse extends AnalyticsMeta {
  @ApiProperty({ format: "uuid" }) campaignId!: string;
  @ApiProperty({ type: [PromotionChannelProgress], maxItems: 7 })
  items!: PromotionChannelProgress[];
}
export class MonthlyAnalyticsItem {
  @ApiProperty({ example: "2026-09" }) month!: string;
  @ApiProperty({ type: Number, minimum: 0 }) tasksCreated!: number;
  @ApiProperty({ type: Number, minimum: 0 }) eventsCreated!: number;
  @ApiProperty({ type: Number, minimum: 0 }) projectsCreated!: number;
  @ApiProperty({ type: Number, minimum: 0 }) productionsCreated!: number;
  @ApiProperty({ type: Number, minimum: 0 }) campaignsCreated!: number;
  @ApiProperty({ type: Number, minimum: 0 }) tasksCompleted!: number;
}
export class MonthlyAnalyticsResponse extends AnalyticsMeta {
  @ApiProperty({ format: "date" }) from!: string;
  @ApiProperty({ format: "date" }) toExclusive!: string;
  @ApiProperty({ type: [MonthlyAnalyticsItem], maxItems: 12 })
  items!: MonthlyAnalyticsItem[];
}
