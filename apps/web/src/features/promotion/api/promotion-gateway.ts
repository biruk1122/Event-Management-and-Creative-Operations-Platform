import type { operations } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { isProblemDetails } from "@/lib/api/problem-details";
import type { CampaignActivity } from "@/features/campaigns/lib/campaigns-types";
import { listCampaignActivities } from "@/features/campaigns/api/campaigns-gateway";

import type { PromotionActivity, PromotionChannel } from "../promotion-types";

const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const BASE = "/api/v1/promotion/campaigns/{campaignId}/activities";
const DETAIL =
  "/api/v1/promotion/campaigns/{campaignId}/activities/{activityId}";
const TALENTS =
  "/api/v1/promotion/campaigns/{campaignId}/activities/{activityId}/talents";
const TALENT_DETAIL =
  "/api/v1/promotion/campaigns/{campaignId}/activities/{activityId}/talents/{talentId}";

export class PromotionRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(
      code === "PROMOTION_DETAIL_CONFLICT"
        ? "This activity already has a promotion channel. Refresh and try again."
        : code === "PROMOTION_ASSIGNMENT_CONFLICT" ||
            code === "PROMOTION_DUPLICATE_TALENT"
          ? "This talent is already assigned to the activity."
          : code === "PROMOTION_ASSIGNMENT_NOT_FOUND"
            ? "That assignment no longer exists. Refresh and try again."
            : code === "TALENT_NOT_FOUND"
              ? "That talent is no longer available. Refresh and try again."
              : status === 401
                ? "Your session expired. Sign in again."
                : status === 403
                  ? "You do not have permission to do that."
                  : status === 404
                    ? "This campaign or activity no longer exists. Refresh and try again."
                    : "We could not save that change. Try again.",
    );
    this.name = "PromotionRequestError";
  }
}

function failure(error: unknown, status: number): PromotionRequestError {
  return new PromotionRequestError(
    status,
    isProblemDetails(error) ? error.code : null,
  );
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

export async function listPromotionActivities(
  campaignId: string,
  signal?: AbortSignal,
): Promise<PromotionActivity[]> {
  const items: PromotionActivity[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error, response } = await browserApi.GET(BASE, {
      params: {
        path: { campaignId },
        query: { page, pageSize: PAGE_SIZE } as unknown as NonNullable<
          operations["Promotion_list_v1"]["parameters"]["query"]
        >,
      },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    });
    if (!data) throw failure(error, response.status);
    items.push(...data.items);
    if (items.length >= data.total || data.items.length === 0) return items;
  }
  throw new Error("Too many promotion activities to display.");
}

export async function listSharedActivities(
  campaignId: string,
  signal?: AbortSignal,
): Promise<CampaignActivity[]> {
  const items = await listCampaignActivities(campaignId, signal);
  if (!items) throw new Error("Campaign activities could not be loaded.");
  return items;
}

export async function listPromotionTalents(signal?: AbortSignal) {
  const items: { id: string; name: string }[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error, response } = await browserApi.GET("/api/v1/talents", {
      params: {
        query: { page, pageSize: PAGE_SIZE } as unknown as NonNullable<
          operations["Talent_list_v1"]["parameters"]["query"]
        >,
      },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    });
    if (!data) throw failure(error, response.status);
    items.push(
      ...data.items.map(({ id, fullName }) => ({ id, name: fullName })),
    );
    if (items.length >= data.total || data.items.length === 0) return items;
  }
  throw new Error("Too many talent choices to display.");
}

export async function attachPromotion(
  campaignId: string,
  activityId: string,
  channel: PromotionChannel,
) {
  const { data, error, response } = await browserApi.POST(DETAIL, {
    params: { path: { campaignId, activityId } },
    body: { channel },
    headers: headers(),
  });
  if (!data) throw failure(error, response.status);
  return data;
}

export async function changePromotionChannel(
  campaignId: string,
  activityId: string,
  channel: PromotionChannel,
) {
  const { data, error, response } = await browserApi.PATCH(DETAIL, {
    params: { path: { campaignId, activityId } },
    body: { channel },
    headers: headers(),
  });
  if (!data) throw failure(error, response.status);
  return data;
}

export async function removePromotion(campaignId: string, activityId: string) {
  const { error, response } = await browserApi.DELETE(DETAIL, {
    params: { path: { campaignId, activityId } },
    headers: headers(),
  });
  if (response.status !== 204) throw failure(error, response.status);
}

export async function assignPromotionTalent(
  campaignId: string,
  activityId: string,
  talentId: string,
  role: string,
) {
  const { data, error, response } = await browserApi.POST(TALENTS, {
    params: { path: { campaignId, activityId } },
    body: { talentId, role },
    headers: headers(),
  });
  if (!data) throw failure(error, response.status);
  return data;
}

export async function unassignPromotionTalent(
  campaignId: string,
  activityId: string,
  talentId: string,
) {
  const { data, error, response } = await browserApi.DELETE(TALENT_DETAIL, {
    params: { path: { campaignId, activityId, talentId } },
    headers: headers(),
  });
  if (!data) throw failure(error, response.status);
  return data;
}
