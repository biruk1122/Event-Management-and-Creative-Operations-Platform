import type { components } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { isProblemDetails } from "@/lib/api/problem-details";

export type PromotionOverview =
  components["schemas"]["PromotionOverviewResponse"];
export type PromotionEvent = components["schemas"]["PromotionEventResponse"];

export class PromotionWorkspaceRequestError extends Error {
  constructor(
    readonly status: number,
    detail?: string,
  ) {
    super(
      detail ??
        (status === 403
          ? "You do not have access to this Promotion summary."
          : "This Promotion summary could not be loaded. Try again."),
    );
    this.name = "PromotionWorkspaceRequestError";
  }
}

function fail(status: number, error: unknown): never {
  throw new PromotionWorkspaceRequestError(
    status,
    isProblemDetails(error) ? error.detail : undefined,
  );
}

/** EVE-234: the Promotion overview, counted from recorded data. */
export async function getPromotionOverview(
  signal?: AbortSignal,
): Promise<PromotionOverview> {
  const { data, error, response } = await browserApi.GET(
    "/api/v1/promotion/overview",
    { ...(signal ? { signal } : {}), cache: "no-store" },
  );
  if (!data) fail(response.status, error);
  return data;
}

export interface UpcomingEventsParams {
  /** Events still running at or after this instant; the server defaults to now. */
  from?: string;
  /** Events starting at or before this instant. */
  to?: string;
  search?: string;
}

/**
 * EVE-234: every upcoming event in the window, read-only, with the promotion
 * campaigns linked to it. Reads every page, up to 20 pages of 100.
 */
export async function listUpcomingPromotionEvents(
  params: UpcomingEventsParams,
  signal?: AbortSignal,
): Promise<PromotionEvent[]> {
  const items: PromotionEvent[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error, response } = await browserApi.GET(
      "/api/v1/promotion/events/upcoming",
      {
        params: {
          query: {
            page,
            pageSize: 100,
            ...(params.from ? { from: params.from } : {}),
            ...(params.to ? { to: params.to } : {}),
            ...(params.search?.trim() ? { search: params.search.trim() } : {}),
            // The generated query type mistypes the paging integers, as on
            // the other list routes.
          } as never,
        },
        ...(signal ? { signal } : {}),
        cache: "no-store",
      },
    );
    if (!data) fail(response.status, error);
    items.push(...data.items);
    if (items.length >= data.total || data.items.length === 0) break;
  }
  return items;
}
