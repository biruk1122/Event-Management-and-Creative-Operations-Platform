import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeActivity } from "@/features/campaigns/test-data";
import {
  listPromotionActivities,
  attachPromotion,
  PromotionRequestError,
} from "./promotion-gateway";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post },
}));
vi.mock("@/lib/api/csrf", () => ({ readCsrfToken: () => "csrf-test" }));

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe("promotion gateway", () => {
  it("reads every scoped page through the generated client", async () => {
    const item = {
      activity: makeActivity(),
      channel: "SOCIAL_MEDIA",
      talents: [],
    };
    get.mockResolvedValueOnce({
      data: { items: [item], total: 2 },
      response: { status: 200 },
    });
    get.mockResolvedValueOnce({
      data: {
        items: [{ ...item, activity: makeActivity({ id: "second" }) }],
        total: 2,
      },
      response: { status: 200 },
    });

    expect(await listPromotionActivities("campaign-1")).toHaveLength(2);
    expect(get).toHaveBeenNthCalledWith(
      2,
      "/api/v1/promotion/campaigns/{campaignId}/activities",
      expect.objectContaining({
        params: {
          path: { campaignId: "campaign-1" },
          query: { page: 2, pageSize: 100 },
        },
      }),
    );
  });

  it("maps Problem Details and sends the CSRF token on writes", async () => {
    post.mockResolvedValueOnce({
      error: { code: "PROMOTION_DETAIL_CONFLICT", status: 409 },
      response: { status: 409 },
    });
    await expect(
      attachPromotion("campaign-1", "activity-1", "RADIO_PROMOTION"),
    ).rejects.toMatchObject({
      status: 409,
      code: "PROMOTION_DETAIL_CONFLICT",
    } satisfies Partial<PromotionRequestError>);
    expect(post).toHaveBeenCalledWith(
      "/api/v1/promotion/campaigns/{campaignId}/activities/{activityId}",
      expect.objectContaining({
        params: {
          path: { campaignId: "campaign-1", activityId: "activity-1" },
        },
        body: { channel: "RADIO_PROMOTION" },
        headers: { "x-csrf-token": "csrf-test" },
      }),
    );
  });
});
