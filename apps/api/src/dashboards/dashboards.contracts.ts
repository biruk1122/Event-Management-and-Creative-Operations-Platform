import {
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import {
  TaskAnalyticsResponse,
  WorkAnalyticsPageResponse,
  ProgressAnalyticsPageResponse,
  PromotionAnalyticsResponse,
  MonthlyAnalyticsResponse,
} from "../analytics/analytics.contracts.js";

export class DashboardItem {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({
    enum: [
      "EVENT",
      "PROJECT",
      "TASK",
      "MEETING",
      "TODO",
      "PERSONAL",
      "REMINDER",
      "CHANNEL",
      "CAMPAIGN_ACTIVITY",
      "TASK_ACTIVITY",
    ],
  })
  kind!: string;
  @ApiPropertyOptional() status?: string;
  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  startAt?: string | null;
  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  endAt?: string | null;
  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  dueAt?: string | null;
  @ApiPropertyOptional({ type: String, format: "date", nullable: true })
  dueDate?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) dueTime?:
    string | null;
  @ApiPropertyOptional({
    type: [String],
    enum: ["OVERDUE", "BLOCKED", "UNDER_REVIEW"],
  })
  attentionReasons?: string[];
  @ApiPropertyOptional({ format: "uuid" }) taskId?: string;
  @ApiPropertyOptional() activityType?: string;
  @ApiPropertyOptional({ format: "date-time" }) occurredAt?: string;
}
export class DashboardCount {
  @ApiProperty({ minimum: 0 }) count!: number;
}
export class DashboardList {
  @ApiProperty({ type: [DashboardItem], maxItems: 10 }) items!: DashboardItem[];
  @ApiProperty() hasMore!: boolean;
}
export class DashboardChannels extends DashboardList {
  @ApiProperty({ minimum: 0 }) count!: number;
}
export class DashboardConversationCount {
  @ApiProperty({ format: "uuid" }) conversationId!: string;
  @ApiProperty({ minimum: 0 }) count!: number;
}
export class DashboardUnread extends DashboardCount {
  @ApiProperty({ type: [DashboardConversationCount], maxItems: 10 })
  items!: DashboardConversationCount[];
  @ApiProperty({ minimum: 0 }) totalConversations!: number;
  @ApiProperty() hasMore!: boolean;
}
const dataTypes = [
  DashboardCount,
  DashboardList,
  DashboardChannels,
  DashboardUnread,
  TaskAnalyticsResponse,
  WorkAnalyticsPageResponse,
  ProgressAnalyticsPageResponse,
  PromotionAnalyticsResponse,
  MonthlyAnalyticsResponse,
];
export type DashboardData =
  | DashboardCount
  | DashboardList
  | DashboardChannels
  | DashboardUnread
  | TaskAnalyticsResponse
  | WorkAnalyticsPageResponse
  | ProgressAnalyticsPageResponse
  | PromotionAnalyticsResponse
  | MonthlyAnalyticsResponse;
export class DashboardSourceState {
  @ApiProperty({
    enum: [
      "ready",
      "empty",
      "denied",
      "selectionRequired",
      "unavailable",
      "partial",
    ],
  })
  state!:
    | "ready"
    | "empty"
    | "denied"
    | "selectionRequired"
    | "unavailable"
    | "partial";
  @ApiPropertyOptional({ enum: ["organization", "department", "self"] })
  scope?: "organization" | "department" | "self";
  @ApiPropertyOptional({ format: "date-time" }) asOf?: string;
  @ApiPropertyOptional({
    anyOf: dataTypes.map((t) => ({ $ref: getSchemaPath(t) })),
  })
  data?: DashboardData;
  @ApiPropertyOptional() code?: string;
  @ApiPropertyOptional() retryable?: boolean;
  @ApiPropertyOptional() requestId?: string;
}
export class DashboardCard extends DashboardSourceState {
  @ApiPropertyOptional({
    type: "object",
    additionalProperties: { $ref: getSchemaPath(DashboardSourceState) },
  })
  sources?: Record<string, DashboardSourceState>;
}
export class DashboardResponse {
  @ApiProperty({ format: "date-time" }) asOf!: string;
  @ApiProperty({ format: "date" }) day!: string;
  @ApiProperty({ enum: ["UTC"] }) timeZone!: "UTC";
  @ApiProperty({ enum: ["live-current-state"] })
  freshness!: "live-current-state";
  @ApiProperty() partial!: boolean;
  @ApiProperty({
    type: "object",
    additionalProperties: { $ref: getSchemaPath(DashboardCard) },
    description:
      "Requested audience card keys only. Each value is one tagged state; denied has no data.",
  })
  cards!: Record<string, DashboardCard>;
}
export const dashboardModels = [
  DashboardItem,
  DashboardCount,
  DashboardList,
  DashboardChannels,
  DashboardUnread,
  DashboardConversationCount,
  DashboardSourceState,
  DashboardCard,
  ...dataTypes,
];
