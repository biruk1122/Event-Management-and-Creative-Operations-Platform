import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsRequestError, fetchAnalytics } from "./analytics-gateway";
import type { Measure } from "../lib/analytics-presentation";
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({ browserApi: { GET: get } }));
const filters = {
  from: "2026-09-01",
  toExclusive: "2026-10-01",
  pageSize: 25,
  subjectId: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
};
beforeEach(() => {
  get.mockReset();
});
describe("analytics transport", () => {
  it.each([
    [
      "tasks",
      "task-completion",
      { from: filters.from, toExclusive: filters.toExclusive },
    ],
    [
      "departments",
      "departments",
      {
        from: filters.from,
        toExclusive: filters.toExclusive,
        page: 2,
        pageSize: 25,
        departmentId: filters.subjectId,
      },
    ],
    [
      "employees",
      "employees",
      {
        from: filters.from,
        toExclusive: filters.toExclusive,
        page: 2,
        pageSize: 25,
        employeeId: filters.subjectId,
      },
    ],
    ["events", "events", { page: 2, pageSize: 25, eventId: filters.subjectId }],
    [
      "campaigns",
      "campaigns",
      {
        page: 2,
        pageSize: 25,
        campaignType: "MARKETING",
        campaignId: filters.subjectId,
      },
    ],
    ["promotion", "promotion", { campaignId: filters.subjectId }],
    [
      "monthly",
      "monthly-activity",
      { from: filters.from, toExclusive: filters.toExclusive },
    ],
  ] as const)(
    "maps %s to the generated endpoint and only applicable parameters",
    async (measure, path, query) => {
      const data = { authoritative: true };
      get.mockResolvedValue({ data, response: new Response() });
      const signal = new AbortController().signal;
      expect(await fetchAnalytics({ measure, filters, page: 2 }, signal)).toBe(
        data,
      );
      expect(get).toHaveBeenCalledExactlyOnceWith(`/api/v1/analytics/${path}`, {
        params: { query },
        signal,
        cache: "no-store",
      });
    },
  );
  it.each([
    ["tasks", { ...filters, from: "2026-02-30" }, 1],
    ["monthly", { ...filters, from: "2026-09-02" }, 1],
    ["promotion", { ...filters, subjectId: "" }, 1],
    ["events", { ...filters, pageSize: 101 }, 1],
    ["employees", filters, 402],
    ["departments", filters, 1.5],
  ] as const)(
    "rejects invalid %s parameters before transport",
    async (measure, values, page) => {
      await expect(
        fetchAnalytics({ measure, filters: values, page }),
      ).rejects.toBeInstanceOf(AnalyticsRequestError);
      expect(get).not.toHaveBeenCalled();
    },
  );
  it.each([401, 403, 400, 404, 503])(
    "maps HTTP %s safely instead of returning zero or raw Problem Details",
    async (status) => {
      get.mockResolvedValue({
        error: {
          status,
          code: status === 503 ? "ANALYTICS_UNAVAILABLE" : "UNKNOWN",
          detail: "private SQL secret",
        },
        response: new Response(null, { status }),
      });
      try {
        await fetchAnalytics({ measure: "tasks", filters, page: 1 });
        throw new Error("Expected failure");
      } catch (error) {
        expect(error).toBeInstanceOf(AnalyticsRequestError);
        expect((error as AnalyticsRequestError).status).toBe(status);
        expect((error as Error).message).not.toContain("secret");
      }
    },
  );
  it("omits blank optional IDs and never falls back to mock data on network failure", async () => {
    get.mockRejectedValue(new TypeError("network offline"));
    await expect(
      fetchAnalytics({
        measure: "events" as Measure,
        filters: { ...filters, subjectId: "" },
        page: 1,
      }),
    ).rejects.toThrow("network offline");
    expect(get.mock.calls[0]?.[1].params.query).toEqual({
      page: 1,
      pageSize: 25,
    });
  });
});
