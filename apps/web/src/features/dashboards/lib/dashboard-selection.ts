import type { paths } from "@event-platform/api-client";
import type { Route } from "next";
import {
  employeeCards,
  managementCards,
  type Audience,
} from "./dashboard-presentation";

export type ManagementQuery = NonNullable<
  paths["/api/v1/dashboards/management"]["get"]["parameters"]["query"]
>;
export type DashboardFilters = Required<Omit<ManagementQuery, "cards">>;
export type DashboardSelection = {
  audience: Audience;
  filters: DashboardFilters;
};
export function defaultDashboardFilters(): DashboardFilters {
  return {
    day: new Date().toISOString().slice(0, 10),
    limit: 5,
    from: "",
    toExclusive: "",
    months: 3,
    promotionCampaignId: "",
  };
}
function validDate(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
export function dashboardFilterError(
  audience: Audience,
  filters: DashboardFilters,
): string | null {
  if (!validDate(filters.day)) return "Choose a valid UTC day.";
  if (
    !Number.isInteger(filters.limit) ||
    filters.limit < 1 ||
    filters.limit > 10
  )
    return "Choose a list limit from 1 to 10.";
  if (audience === "employee") return null;
  if (
    !Number.isInteger(filters.months) ||
    filters.months < 1 ||
    filters.months > 12
  )
    return "Choose 1 to 12 UTC months.";
  if (filters.from || filters.toExclusive) {
    if (!validDate(filters.from) || !validDate(filters.toExclusive))
      return "Supply both valid UTC cohort dates.";
    const days =
      (Date.parse(filters.toExclusive) - Date.parse(filters.from)) / 86_400_000;
    if (days <= 0 || days > 366)
      return "Cohort end must follow start by at most 366 days (end excluded).";
  }
  if (
    filters.promotionCampaignId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      filters.promotionCampaignId,
    )
  )
    return "Enter a valid promotion campaign UUID.";
  return null;
}
export function readDashboardSelection(
  params: Pick<URLSearchParams, "get" | "forEach">,
  fallback: Audience,
  defaults: DashboardFilters,
) {
  const rawAudience = params.get("audience") ?? fallback;
  const audience: Audience =
    rawAudience === "employee" ? "employee" : "management";
  const filters: DashboardFilters = {
    day: params.get("day") ?? defaults.day,
    limit: Number(params.get("limit") ?? defaults.limit),
    from: params.get("from") ?? "",
    toExclusive: params.get("toExclusive") ?? "",
    months: Number(params.get("months") ?? defaults.months),
    promotionCampaignId: params.get("promotionCampaignId") ?? "",
  };
  let invalidKey = false;
  const seen = new Set<string>();
  params.forEach((_, key) => {
    if (
      seen.has(key) ||
      ![
        "audience",
        "day",
        "limit",
        ...(audience === "management"
          ? ["from", "toExclusive", "months", "promotionCampaignId"]
          : []),
      ].includes(key)
    )
      invalidKey = true;
    seen.add(key);
  });
  const error = !["management", "employee"].includes(rawAudience)
    ? "Choose a valid dashboard view."
    : invalidKey
      ? "The dashboard URL contains unsupported or duplicate filters."
      : dashboardFilterError(audience, filters);
  return { audience, filters, error };
}
export function dashboardQuery({
  audience,
  filters,
}: DashboardSelection): ManagementQuery {
  const cards = (audience === "management" ? managementCards : employeeCards)
    .map((card) => card.key)
    .join(",");
  return {
    cards,
    day: filters.day,
    limit: filters.limit,
    ...(audience === "management"
      ? {
          months: filters.months,
          ...(filters.from
            ? { from: filters.from, toExclusive: filters.toExclusive }
            : {}),
          ...(filters.promotionCampaignId
            ? { promotionCampaignId: filters.promotionCampaignId }
            : {}),
        }
      : {}),
  };
}
export function dashboardUrl(selection: DashboardSelection): Route {
  const query = dashboardQuery(selection);
  const params = new URLSearchParams({ audience: selection.audience });
  for (const [key, value] of Object.entries(query))
    if (key !== "cards") params.set(key, String(value));
  return `/dashboard?${params}` as Route;
}
