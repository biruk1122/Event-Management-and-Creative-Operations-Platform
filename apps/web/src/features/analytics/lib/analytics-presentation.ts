import type { components } from "@event-platform/api-client";

type Schemas = components["schemas"];
export const MEASURES = {
  tasks: "Task completion",
  departments: "Department performance",
  employees: "Employee performance",
  events: "Event progress",
  campaigns: "Marketing campaign progress",
  promotion: "Promotion performance",
  monthly: "Monthly activity",
} as const;
export type Measure = keyof typeof MEASURES;
export interface Responses {
  tasks: Schemas["TaskAnalyticsResponse"];
  departments: Schemas["WorkAnalyticsPageResponse"];
  employees: Schemas["WorkAnalyticsPageResponse"];
  events: Schemas["ProgressAnalyticsPageResponse"];
  campaigns: Schemas["ProgressAnalyticsPageResponse"];
  promotion: Schemas["PromotionAnalyticsResponse"];
  monthly: Schemas["MonthlyAnalyticsResponse"];
}
export type Panel<T> =
  | { state: "ready"; data: T }
  | { state: "loading" | "error" | "denied" | "unavailable" };
export type Panels = { [K in Measure]?: Panel<Responses[K]> };
export interface AnalyticsFilters {
  from: string;
  toExclusive: string;
  subjectId: string;
  pageSize: number;
}
export const EMPTY_FILTERS: AnalyticsFilters = {
  from: "",
  toExclusive: "",
  subjectId: "",
  pageSize: 25,
};

export function analyticsAbilities(access: Schemas["CurrentAccessResponse"]) {
  const has = (key: string, department = false) =>
    access.grants.some(
      (grant) =>
        grant.permissionKey === key &&
        (["ORGANIZATION", "MANAGEMENT"].includes(grant.scope) ||
          (department && grant.scope === "DEPARTMENT")),
    );
  const management = has("analytics.management.read");
  return {
    tasks: management,
    events: management,
    campaigns: management,
    promotion: management,
    monthly: management,
    departments: has("analytics.department_performance.read", true),
    employees: has("analytics.employee_performance.read"),
  };
}

export function needsPeriod(measure: Measure) {
  return ["tasks", "departments", "employees", "monthly"].includes(measure);
}
export function isPaged(measure: Measure) {
  return ["departments", "employees", "events", "campaigns"].includes(measure);
}
export function filterError(measure: Measure, filters: AnalyticsFilters) {
  if (needsPeriod(measure)) {
    const validDate = (value: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value;
    if (!validDate(filters.from) || !validDate(filters.toExclusive))
      return "Enter two valid UTC dates.";
    const days =
      (Date.parse(filters.toExclusive) - Date.parse(filters.from)) / 86_400_000;
    if (days <= 0) return "End (exclusive) must be after start.";
    if (measure === "monthly") {
      const start = new Date(filters.from),
        end = new Date(filters.toExclusive);
      const months =
        (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
        end.getUTCMonth() -
        start.getUTCMonth();
      if (start.getUTCDate() !== 1 || end.getUTCDate() !== 1 || months > 12)
        return "Choose first-of-month boundaries spanning 1 to 12 months.";
    } else if (days > 366)
      return "Choose a creation period of at most 366 days.";
  }
  if (measure === "promotion" && !filters.subjectId)
    return "Enter a promotion campaign ID.";
  if (
    measure !== "tasks" &&
    measure !== "monthly" &&
    filters.subjectId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      filters.subjectId,
    )
  )
    return "Enter a valid subject UUID.";
  if (isPaged(measure) && ![25, 50, 100].includes(filters.pageSize))
    return "Choose 25, 50, or 100 rows per page.";
  return null;
}
export const rateLabel = (value: number | null) =>
  value === null ? "No eligible work" : `${value}%`;
