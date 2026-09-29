import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, post, patch, del, csrf } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  csrf: vi.fn(),
}));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: patch, DELETE: del },
}));
vi.mock("@/lib/api/csrf", () => ({ readCsrfToken: csrf }));

import {
  createMarketingStrategy,
  getMarketingStrategy,
  MarketingRequestError,
  removeMarketingStrategy,
  updateMarketingStrategy,
} from "./marketing-gateway";

const path = "/api/v1/marketing/campaigns/{campaignId}/strategy";
const strategy = {
  campaignId: "campaign-1",
  strategy: "Partner outreach",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};
const problem = (status: number, code: string, errors?: unknown) => ({
  error: { status, code, errors },
  response: { status },
});

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  del.mockReset();
  csrf.mockReturnValue("csrf-token");
});

describe("marketing gateway", () => {
  it("reads real strategy data and treats only strategy-not-found as empty", async () => {
    const signal = new AbortController().signal;
    get.mockResolvedValueOnce({ data: strategy, response: { status: 200 } });
    expect(await getMarketingStrategy("campaign-1", signal)).toEqual(strategy);
    expect(get).toHaveBeenCalledWith(path, {
      params: { path: { campaignId: "campaign-1" } },
      signal,
      cache: "no-store",
    });
    get.mockResolvedValueOnce(problem(404, "MARKETING_STRATEGY_NOT_FOUND"));
    expect(await getMarketingStrategy("campaign-1")).toBeNull();
    get.mockResolvedValueOnce(problem(404, "CAMPAIGN_NOT_FOUND"));
    await expect(getMarketingStrategy("campaign-1")).rejects.toMatchObject({
      status: 404,
      code: "CAMPAIGN_NOT_FOUND",
    });
  });

  it("creates, updates, and deletes through the generated client with CSRF", async () => {
    post.mockResolvedValue({ data: strategy, response: { status: 201 } });
    patch.mockResolvedValue({ data: strategy, response: { status: 200 } });
    del.mockResolvedValue({ response: { status: 204 } });
    await createMarketingStrategy("campaign-1", "Partner outreach");
    await updateMarketingStrategy("campaign-1", "Partner outreach");
    await removeMarketingStrategy("campaign-1");
    for (const call of [post, patch]) {
      expect(call).toHaveBeenCalledWith(path, {
        params: { path: { campaignId: "campaign-1" } },
        body: { strategy: "Partner outreach" },
        headers: { "x-csrf-token": "csrf-token" },
      });
    }
    expect(del).toHaveBeenCalledWith(path, {
      params: { path: { campaignId: "campaign-1" } },
      headers: { "x-csrf-token": "csrf-token" },
    });
  });

  it("maps validation, conflict, permission, and unavailable errors safely", async () => {
    post.mockResolvedValueOnce(
      problem(400, "VALIDATION_ERROR", { strategy: ["Too long"] }),
    );
    await expect(createMarketingStrategy("campaign-1", "x")).rejects.toThrow(
      "Too long",
    );
    post.mockResolvedValueOnce(problem(409, "MARKETING_STRATEGY_CONFLICT"));
    await expect(
      createMarketingStrategy("campaign-1", "x"),
    ).rejects.toMatchObject({
      name: "MarketingRequestError",
      status: 409,
      code: "MARKETING_STRATEGY_CONFLICT",
    });
    patch.mockResolvedValueOnce(problem(403, "PERMISSION_DENIED"));
    await expect(updateMarketingStrategy("campaign-1", "x")).rejects.toThrow(
      "do not have permission",
    );
    del.mockResolvedValueOnce({ error: {}, response: { status: 503 } });
    await expect(removeMarketingStrategy("campaign-1")).rejects.toBeInstanceOf(
      MarketingRequestError,
    );
  });
});
