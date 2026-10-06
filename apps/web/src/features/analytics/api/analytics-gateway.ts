import { browserApi } from "@/lib/api/browser";
import { isProblemDetails } from "@/lib/api/problem-details";
import {
  filterError,
  isPaged,
  type Measure,
  type Responses,
} from "../lib/analytics-presentation";
import type { AnalyticsSelection } from "../lib/analytics-url";

const MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: "Check the analytics filters and try again.",
  ANALYTICS_INVALID_RANGE: "Choose valid UTC dates within the permitted range.",
  ANALYTICS_INVALID_PAGE:
    "The page exceeds the paging limit. Narrow the subject filter.",
  ANALYTICS_SUBJECT_NOT_FOUND:
    "The promotion campaign is unavailable. Check the campaign ID.",
  ANALYTICS_UNAVAILABLE: "This measure is temporarily unavailable. Try again.",
};
export class AnalyticsRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
  ) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "Your analytics access changed. Check permissions again."
          : code && MESSAGES[code]
            ? MESSAGES[code]
            : status === 404
              ? "The analytics subject is unavailable. Check the subject ID."
              : "The analytics request failed. Try again.",
    );
    this.name = "AnalyticsRequestError";
  }
}
function authoritative<T>(result: {
  data?: T;
  error?: unknown;
  response: Response;
}): T {
  if (!result.response.ok || result.data === undefined)
    throw new AnalyticsRequestError(
      result.response.status,
      isProblemDetails(result.error) ? result.error.code : null,
    );
  return result.data;
}
export async function fetchAnalytics(
  selection: AnalyticsSelection,
  signal?: AbortSignal,
): Promise<Responses[Measure]> {
  const { measure, filters, page } = selection;
  const invalid = filterError(measure, filters);
  if (
    invalid ||
    (isPaged(measure) &&
      (!Number.isSafeInteger(page) ||
        page < 1 ||
        (page - 1) * filters.pageSize > 10000))
  )
    throw new AnalyticsRequestError(
      400,
      invalid ? "VALIDATION_ERROR" : "ANALYTICS_INVALID_PAGE",
    );
  const options = { ...(signal ? { signal } : {}), cache: "no-store" as const };
  const period = { from: filters.from, toExclusive: filters.toExclusive };
  const paging = { page, pageSize: filters.pageSize };
  switch (measure) {
    case "tasks":
      return authoritative(
        await browserApi.GET("/api/v1/analytics/task-completion", {
          ...options,
          params: { query: period },
        }),
      );
    case "departments":
      return authoritative(
        await browserApi.GET("/api/v1/analytics/departments", {
          ...options,
          params: {
            query: {
              ...period,
              ...paging,
              ...(filters.subjectId ? { departmentId: filters.subjectId } : {}),
            },
          },
        }),
      );
    case "employees":
      return authoritative(
        await browserApi.GET("/api/v1/analytics/employees", {
          ...options,
          params: {
            query: {
              ...period,
              ...paging,
              ...(filters.subjectId ? { employeeId: filters.subjectId } : {}),
            },
          },
        }),
      );
    case "events":
      return authoritative(
        await browserApi.GET("/api/v1/analytics/events", {
          ...options,
          params: {
            query: {
              ...paging,
              ...(filters.subjectId ? { eventId: filters.subjectId } : {}),
            },
          },
        }),
      );
    case "campaigns":
      return authoritative(
        await browserApi.GET("/api/v1/analytics/campaigns", {
          ...options,
          params: {
            query: {
              ...paging,
              campaignType: "MARKETING",
              ...(filters.subjectId ? { campaignId: filters.subjectId } : {}),
            },
          },
        }),
      );
    case "promotion":
      return authoritative(
        await browserApi.GET("/api/v1/analytics/promotion", {
          ...options,
          params: { query: { campaignId: filters.subjectId } },
        }),
      );
    case "monthly":
      return authoritative(
        await browserApi.GET("/api/v1/analytics/monthly-activity", {
          ...options,
          params: { query: period },
        }),
      );
  }
}
