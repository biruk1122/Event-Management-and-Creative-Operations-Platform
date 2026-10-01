import { ReportType, type ReportStatus } from "../generated/prisma/client.js";
import {
  reportInvalidPeriod,
  reportInvalidSections,
} from "./reports.errors.js";

export const SECTION_KEYS = [
  "problemsEncountered",
  "nextDayPlan",
  "departmentActivities",
  "majorAchievements",
  "challenges",
  "nextWeekPlan",
  "departmentPerformance",
  "employeePerformance",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export type Sections = Partial<Record<SectionKey, string | null>>;

const APPLICABLE: Record<ReportType, readonly SectionKey[]> = {
  DAILY: ["problemsEncountered", "nextDayPlan"],
  WEEKLY: [
    "departmentActivities",
    "majorAchievements",
    "challenges",
    "nextWeekPlan",
  ],
  MONTHLY: [
    "majorAchievements",
    "challenges",
    "departmentPerformance",
    "employeePerformance",
  ],
};

export function parsePeriod(type: ReportType, start: string, end: string) {
  const pattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (!pattern.test(start) || !pattern.test(end)) throw reportInvalidPeriod();
  const from = new Date(`${start}T00:00:00.000Z`);
  const to = new Date(`${end}T00:00:00.000Z`);
  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from.toISOString().slice(0, 10) !== start ||
    to.toISOString().slice(0, 10) !== end
  ) {
    throw reportInvalidPeriod();
  }
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  if (
    (type === ReportType.DAILY && days !== 0) ||
    (type === ReportType.WEEKLY && days !== 6) ||
    (type === ReportType.MONTHLY &&
      (from.getUTCDate() !== 1 ||
        end !==
          new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0))
            .toISOString()
            .slice(0, 10)))
  ) {
    throw reportInvalidPeriod();
  }
  return { from, to };
}

export function validateSections(type: ReportType, sections: Sections): void {
  for (const key of SECTION_KEYS) {
    const value = sections[key];
    if (
      value !== undefined &&
      value !== null &&
      (typeof value !== "string" || !value.trim() || value.length > 5000)
    ) {
      throw reportInvalidSections();
    }
    if (value != null && !APPLICABLE[type].includes(key))
      throw reportInvalidSections();
  }
}

export function validateSubmission(type: ReportType, sections: Sections): void {
  validateSections(type, sections);
  // The SRS names these narrative sections for each report type. A submit is
  // complete only when each applicable section is present; drafts may be partial.
  if (APPLICABLE[type].some((key) => !sections[key]?.trim()))
    throw reportInvalidSections();
}

export function canEdit(status: ReportStatus): boolean {
  return status === "DRAFT" || status === "CHANGES_REQUESTED";
}
