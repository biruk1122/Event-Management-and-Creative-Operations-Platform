import { beforeEach, describe, expect, it, vi } from "vitest";
const get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/browser", () => ({ browserApi: { GET: get } }));
import { fetchDashboard, DashboardRequestError } from "./dashboard-gateway";
import { defaultDashboardFilters } from "../lib/dashboard-selection";
const filters = {
  ...defaultDashboardFilters(),
  day: "2026-10-07",
  from: "2026-09-01",
  toExclusive: "2026-10-01",
  months: 6,
  limit: 10,
  promotionCampaignId: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
};
beforeEach(() => get.mockReset());
describe("dashboard generated-client gateway", () => {
  it("passes bounded management fields and abort signal without changing partial payloads", async () => {
    const data = {
      partial: true,
      cards: { pendingTasks: { state: "ready", data: { count: 3 } } },
    };
    get.mockResolvedValue({ data, response: new Response() });
    const signal = new AbortController().signal;
    expect(
      await fetchDashboard({ audience: "management", filters }, signal),
    ).toBe(data);
    expect(get.mock.calls[0]?.[0]).toBe("/api/v1/dashboards/management");
    expect(get.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-store",
      signal,
      params: { query: filters },
    });
    expect(get.mock.calls[0]?.[1].params.query.cards.split(",")).toHaveLength(
      23,
    );
  });
  it("never sends management fields or caller identity to the employee endpoint", async () => {
    get.mockResolvedValue({ data: { cards: {} }, response: new Response() });
    await fetchDashboard({ audience: "employee", filters });
    expect(get.mock.calls[0]?.[0]).toBe("/api/v1/dashboards/employee");
    expect(Object.keys(get.mock.calls[0]?.[1].params.query).sort()).toEqual([
      "cards",
      "day",
      "limit",
    ]);
    expect(get.mock.calls[0]?.[1].params.query.cards.split(",")).toHaveLength(
      7,
    );
  });
  it("rejects invalid input before any network read", async () => {
    await expect(
      fetchDashboard({
        audience: "management",
        filters: { ...filters, limit: 11 },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(get).not.toHaveBeenCalled();
  });
  it.each([400, 401, 403, 429, 503])(
    "maps HTTP %s without exposing raw Problem Details",
    async (status) => {
      get.mockResolvedValue({
        response: new Response(null, { status }),
        error: {
          status,
          code: "DASHBOARD_UNAVAILABLE",
          requestId: "ref",
          detail: "private SQL or existence",
        },
      });
      const error = await fetchDashboard({
        audience: "management",
        filters,
      }).catch((error: unknown) => error);
      expect(error).toBeInstanceOf(DashboardRequestError);
      expect(error).toMatchObject({ status, requestId: "ref" });
      expect((error as Error).message).not.toContain("private");
    },
  );
});
