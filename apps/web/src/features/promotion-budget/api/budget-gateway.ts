import type { components } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { isProblemDetails } from "@/lib/api/problem-details";

export type CampaignBudgetSummary =
  components["schemas"]["CampaignBudgetSummaryResponse"];

export class BudgetRequestError extends Error {
  constructor(
    readonly status: number,
    detail?: string,
  ) {
    super(
      detail ??
        (status === 403
          ? "You do not have access to campaign budgets."
          : "Budgets could not be loaded. Try again."),
    );
    this.name = "BudgetRequestError";
  }
}

/** Budget summaries of every promotion campaign the caller may see (EVE-233). */
export async function listPromotionBudgetSummaries(
  signal?: AbortSignal,
): Promise<CampaignBudgetSummary[]> {
  const items: CampaignBudgetSummary[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error, response } = await browserApi.GET(
      "/api/v1/campaigns/budget-summaries",
      {
        params: {
          query: { campaignType: "PROMOTION", page, pageSize: 100 } as never,
        },
        ...(signal ? { signal } : {}),
        cache: "no-store",
      },
    );
    if (!data)
      throw new BudgetRequestError(
        response.status,
        isProblemDetails(error) ? error.detail : undefined,
      );
    items.push(...data.items);
    if (items.length >= data.total || data.items.length === 0) return items;
  }
  return items;
}
