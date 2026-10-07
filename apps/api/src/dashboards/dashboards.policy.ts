import { BadRequestException } from "@nestjs/common";
import { analyticsPeriod } from "../analytics/analytics.policy.js";
import type { EffectiveGrant } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import type {
  DashboardQueryDto,
  ManagementDashboardQueryDto,
} from "./dashboards.dto.js";

export const managementCards = [
  "totalEvents",
  "upcomingEvents",
  "activeProjects",
  "activeCampaigns",
  "pendingTasks",
  "completedTasks",
  "overdueTasks",
  "activeEmployees",
  "activeTalents",
  "todayEvents",
  "todayMeetings",
  "todayDeadlines",
  "attentionTasks",
  "overdueActivities",
  "unreadMessages",
  "activeChannels",
  "upcomingMeetings",
  "taskCompletionRate",
  "departmentPerformance",
  "eventProgress",
  "marketingProgress",
  "promotionPerformance",
  "monthlyActivity",
] as const;
export const employeeCards = [
  "myTasks",
  "myTodo",
  "todaySchedule",
  "myUpcomingMeetings",
  "myUpcomingDeadlines",
  "myUnreadMessages",
  "recentActivity",
] as const;
export type CardKey =
  (typeof managementCards)[number] | (typeof employeeCards)[number];
export type Audience = "management" | "employee";
export function invalidQuery(): never {
  throw new BadRequestException({
    code: "DASHBOARD_QUERY_INVALID",
    detail: "Invalid dashboard cards, filters or range.",
  });
}
export function requireAudience(
  grants: EffectiveGrant[],
  audience: Audience,
): void {
  if (
    !grants.some(
      (g) =>
        g.permissionKey ===
          (audience === "management"
            ? "dashboard.management.read"
            : "dashboard.read") &&
        (audience === "management"
          ? ["MANAGEMENT", "ORGANIZATION"].includes(g.scope)
          : g.scope === "SELF"),
    )
  )
    throw permissionDenied();
}
export function dashboardQuery(
  audience: Audience,
  dto: DashboardQueryDto,
  now = new Date(),
) {
  const allowed = audience === "management" ? managementCards : employeeCards;
  const fields = [
    "cards",
    "day",
    "limit",
    ...(audience === "management"
      ? ["from", "toExclusive", "months", "promotionCampaignId"]
      : []),
  ];
  if (Object.keys(dto).some((k) => !fields.includes(k))) invalidQuery();
  const cards = dto.cards === undefined ? [...allowed] : dto.cards.split(",");
  if (
    !cards.length ||
    new Set(cards).size !== cards.length ||
    cards.some((k) => !(allowed as readonly string[]).includes(k))
  )
    invalidQuery();
  const limit = dto.limit ?? 5;
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) invalidQuery();
  const day = dto.day ?? now.toISOString().slice(0, 10);
  const start = new Date(day + "T00:00:00.000Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    day.startsWith("0000-") ||
    !Number.isFinite(start.getTime()) ||
    start.toISOString().slice(0, 10) !== day
  )
    invalidQuery();
  const m = dto as ManagementDashboardQueryDto;
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const nextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  if ((m.from === undefined) !== (m.toExclusive === undefined)) invalidQuery();
  const from = m.from ?? monthStart.toISOString().slice(0, 10),
    toExclusive = m.toExclusive ?? nextMonth.toISOString().slice(0, 10);
  try {
    analyticsPeriod({ from, toExclusive });
  } catch {
    invalidQuery();
  }
  const months = m.months ?? 3;
  if (!Number.isInteger(months) || months < 1 || months > 12) invalidQuery();
  if (
    m.promotionCampaignId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      m.promotionCampaignId,
    )
  )
    invalidQuery();
  return {
    cards: cards as CardKey[],
    day,
    limit,
    from,
    toExclusive,
    months,
    promotionCampaignId: m.promotionCampaignId,
    today: {
      from: start,
      to: new Date(start.getTime() + 86400000),
      asOf: now,
      limit,
    },
    upcoming: {
      from: now,
      to: new Date(now.getTime() + 7 * 86400000),
      asOf: now,
      limit,
    },
    monthly: {
      from: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1),
      )
        .toISOString()
        .slice(0, 10),
      toExclusive: nextMonth.toISOString().slice(0, 10),
    },
  };
}
