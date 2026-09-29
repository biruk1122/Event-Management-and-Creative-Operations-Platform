import type { components } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { fieldErrorsOf, isProblemDetails } from "@/lib/api/problem-details";

export type MarketingStrategy =
  components["schemas"]["MarketingStrategyResponse"];

const PATH = "/api/v1/marketing/campaigns/{campaignId}/strategy";

export class MarketingRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "MarketingRequestError";
  }
}

function failure(error: unknown, status: number): MarketingRequestError {
  const problem = isProblemDetails(error) ? error : null;
  const code = problem?.code ?? null;
  const message =
    code === "MARKETING_STRATEGY_CONFLICT"
      ? "A strategy was added elsewhere. Review the latest version and try again."
      : code === "MARKETING_STRATEGY_NOT_FOUND"
        ? "This strategy was removed elsewhere. Review the campaign and try again."
        : code === "VALIDATION_ERROR"
          ? (fieldErrorsOf(problem).strategy ??
            "Check the strategy text and try again.")
          : status === 401
            ? "Your session expired. Sign in again."
            : status === 403
              ? "You do not have permission to change this strategy."
              : status === 404
                ? "This marketing campaign no longer exists. Refresh the list."
                : "We could not save that change. Try again.";
  return new MarketingRequestError(status, code, message);
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

/** A missing strategy is the empty state; a missing campaign is an error. */
export async function getMarketingStrategy(
  campaignId: string,
  signal?: AbortSignal,
): Promise<MarketingStrategy | null> {
  const { data, error, response } = await browserApi.GET(PATH, {
    params: { path: { campaignId } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (data) return data;
  if (
    response.status === 404 &&
    isProblemDetails(error) &&
    error.code === "MARKETING_STRATEGY_NOT_FOUND"
  ) {
    return null;
  }
  throw failure(error, response.status);
}

export async function createMarketingStrategy(
  campaignId: string,
  strategy: string,
): Promise<MarketingStrategy> {
  const { data, error, response } = await browserApi.POST(PATH, {
    params: { path: { campaignId } },
    body: { strategy },
    headers: headers(),
  });
  if (!data) throw failure(error, response.status);
  return data;
}

export async function updateMarketingStrategy(
  campaignId: string,
  strategy: string,
): Promise<MarketingStrategy> {
  const { data, error, response } = await browserApi.PATCH(PATH, {
    params: { path: { campaignId } },
    body: { strategy },
    headers: headers(),
  });
  if (!data) throw failure(error, response.status);
  return data;
}

export async function removeMarketingStrategy(
  campaignId: string,
): Promise<void> {
  const { error, response } = await browserApi.DELETE(PATH, {
    params: { path: { campaignId } },
    headers: headers(),
  });
  if (response.status !== 204) throw failure(error, response.status);
}
