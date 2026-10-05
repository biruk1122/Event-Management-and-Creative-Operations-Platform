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
export function analyticsPeriod(
  dto: AnalyticsPeriodDto,
  monthly = false,
): ReadPeriod {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-"))
      throw analyticsInvalidRange();
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      throw analyticsInvalidRange();
    return date;
  };
  const from = parse(dto.from),
    toExclusive = parse(dto.toExclusive);
  const days = (toExclusive.getTime() - from.getTime()) / 86400000;
  if (days <= 0 || days > 366) throw analyticsInvalidRange();
  if (monthly) {
    const months =
      (toExclusive.getUTCFullYear() - from.getUTCFullYear()) * 12 +
      toExclusive.getUTCMonth() -
      from.getUTCMonth();
    if (
      from.getUTCDate() !== 1 ||
      toExclusive.getUTCDate() !== 1 ||
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
