import type { components } from "@event-platform/api-client";

export type Report = components["schemas"]["ReportResponse"];
export type ReportDetail = components["schemas"]["ReportDetailResponse"];
export type ReportList = components["schemas"]["PaginatedReportsResponse"];
export type CreateReport = components["schemas"]["CreateReportDto"];
export type ReportType = Report["type"];
export type ReportStatus = Report["status"];
export type ReviewOutcome = components["schemas"]["ReviewReportDto"]["outcome"];

export const REPORT_TYPES: readonly ReportType[] = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
];
export const REPORT_STATUSES: readonly ReportStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "CHANGES_REQUESTED",
  "REVIEWED",
];

export const TYPE_LABELS: Record<ReportType, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
};

export const STATUS_LABELS: Record<ReportStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  CHANGES_REQUESTED: "Changes requested",
  REVIEWED: "Reviewed",
};

export const NARRATIVE_FIELDS: Record<
  ReportType,
  readonly { key: keyof CreateReport; label: string }[]
> = {
  DAILY: [
    { key: "problemsEncountered", label: "Problems encountered" },
    { key: "nextDayPlan", label: "Next day's plan" },
  ],
  WEEKLY: [
    { key: "departmentActivities", label: "Department activities" },
    { key: "majorAchievements", label: "Major achievements" },
    { key: "challenges", label: "Challenges" },
    { key: "nextWeekPlan", label: "Next week's plan" },
  ],
  MONTHLY: [
    { key: "departmentPerformance", label: "Department performance" },
    { key: "employeePerformance", label: "Employee performance" },
    { key: "majorAchievements", label: "Major achievements" },
    { key: "challenges", label: "Challenges" },
  ],
};

export function periodLabel(report: Pick<Report, "periodStart" | "periodEnd">) {
  return report.periodStart === report.periodEnd
    ? report.periodStart
    : `${report.periodStart} to ${report.periodEnd}`;
}

export function statusVariant(status: ReportStatus) {
  if (status === "CHANGES_REQUESTED") return "destructive" as const;
  if (status === "SUBMITTED") return "default" as const;
  return "secondary" as const;
}
