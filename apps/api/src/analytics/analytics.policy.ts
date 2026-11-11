import type { EffectiveGrant } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import type { ReadPage, ReadPeriod } from "../database/read-models.js";
import type { AnalyticsPeriodDto } from "./analytics.dto.js";
import {
  analyticsInvalidPage,
  analyticsInvalidRange,
} from "./analytics.errors.js";

export function analyticsScope(
  grants: EffectiveGrant[],
  key: string,
  allowDepartment = false,
): "organization" | "department" {
  const scoped = grants.filter((grant) => grant.permissionKey === key);
  if (
    scoped.some(
      (grant) => grant.scope === "ORGANIZATION" || grant.scope === "MANAGEMENT",
    )
  )
    return "organization";
  if (allowDepartment && scoped.some((grant) => grant.scope === "DEPARTMENT"))
    return "department";
  throw permissionDenied();
}
/** Calendar zone for dashboard date filters (Addis Ababa, EAT, UTC+3). */
export const APP_CALENDAR_TIME_ZONE = "Africa/Addis_Ababa";

/** Offset of `zone` from UTC at `instant`, in minutes east of UTC. */
export function zoneOffsetMinutes(instant: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(instant);
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const wallClockAsUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );
  return (wallClockAsUtc - instant.getTime()) / 60_000;
}

/** The UTC instant of local midnight at the start of the calendar day `ymd` in `zone`. */
export function localDayStartUtc(ymd: string, zone: string): Date {
  const naive = new Date(`${ymd}T00:00:00.000Z`);
  return new Date(naive.getTime() - zoneOffsetMinutes(naive, zone) * 60_000);
}

export type AnalyticsPeriodInput = AnalyticsPeriodDto & { timeZone?: string };

export function analyticsPeriod(
  dto: AnalyticsPeriodInput,
  monthly = false,
): ReadPeriod {
  const zone = dto.timeZone ?? "UTC";
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-"))
      throw analyticsInvalidRange();
    const calendar = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(calendar.getTime()) ||
      calendar.toISOString().slice(0, 10) !== value
    )
      throw analyticsInvalidRange();
    return localDayStartUtc(value, zone);
  };
  const from = parse(dto.from),
    toExclusive = parse(dto.toExclusive);
  const days = (toExclusive.getTime() - from.getTime()) / 86400000;
  if (days <= 0 || days > 366) throw analyticsInvalidRange();
  if (monthly) {
    const [fromYear = 0, fromMonth = 0] = dto.from.split("-").map(Number);
    const [toYear = 0, toMonth = 0] = dto.toExclusive.split("-").map(Number);
    const months = (toYear - fromYear) * 12 + (toMonth - fromMonth);
    if (
      dto.from.slice(8) !== "01" ||
      dto.toExclusive.slice(8) !== "01" ||
      months < 1 ||
      months > 12
    )
      throw analyticsInvalidRange();
  }
  return { from, toExclusive };
}
export function analyticsPage(page: ReadPage): ReadPage {
  if (
    !Number.isInteger(page.page) ||
    !Number.isInteger(page.pageSize) ||
    page.page < 1 ||
    page.pageSize < 1 ||
    page.pageSize > 100 ||
    (page.page - 1) * page.pageSize > 10000
  )
    throw analyticsInvalidPage();
  return page;
}
