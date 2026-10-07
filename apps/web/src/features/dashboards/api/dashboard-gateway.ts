import type { components } from "@event-platform/api-client";
import { browserApi } from "@/lib/api/browser";
import { isProblemDetails } from "@/lib/api/problem-details";
import {
  dashboardFilterError,
  dashboardQuery,
  type DashboardSelection,
} from "../lib/dashboard-selection";

export type DashboardResponse = components["schemas"]["DashboardResponse"];
export class DashboardRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    readonly requestId?: string,
  ) {
    super(
      status === 401
        ? "Your session ended. Sign in again."
        : status === 403
          ? "Your dashboard access changed. Check permissions again."
          : status === 400
            ? "Check the dashboard filters and try again."
            : status === 429
              ? "Too many requests. Wait before refreshing."
              : "The dashboard service could not be reached. Try again.",
    );
    this.name = "DashboardRequestError";
  }
}
export async function fetchDashboard(
  selection: DashboardSelection,
  signal?: AbortSignal,
): Promise<DashboardResponse> {
  if (dashboardFilterError(selection.audience, selection.filters))
    throw new DashboardRequestError(400, "VALIDATION_ERROR");
  const options = {
    params: { query: dashboardQuery(selection) },
    cache: "no-store" as const,
    ...(signal ? { signal } : {}),
  };
  const result =
    selection.audience === "management"
      ? await browserApi.GET("/api/v1/dashboards/management", options)
      : await browserApi.GET("/api/v1/dashboards/employee", options);
  if (!result.response.ok || !result.data) {
    const problem = isProblemDetails(result.error) ? result.error : null;
    throw new DashboardRequestError(
      result.response.status,
      problem?.code ?? null,
      problem?.requestId,
    );
  }
  return result.data;
}
