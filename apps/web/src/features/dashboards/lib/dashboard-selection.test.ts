import { describe, expect, it } from "vitest";
import {
  dashboardFilterError,
  dashboardUrl,
  defaultDashboardFilters,
  readDashboardSelection,
} from "./dashboard-selection";
const defaults = { ...defaultDashboardFilters(), day: "2026-10-07" };
describe("dashboard bounded selection", () => {
  it.each([
    "day=2026-02-30",
    "day=bad",
    "limit=0",
    "limit=11",
    "limit=1.5",
    "months=13",
    "months=0",
    "from=2026-01-01",
    "from=2026-10-07&toExclusive=2026-10-07",
    "from=2024-01-01&toExclusive=2026-01-01",
    "promotionCampaignId=bad",
    "userId=other",
    "audience=employee&months=3",
    "audience=other",
    "limit=1&limit=2",
  ])("rejects invalid URL %s without silently broadening requests", (query) => {
    expect(
      readDashboardSelection(new URLSearchParams(query), "management", defaults)
        .error,
    ).toBeTruthy();
  });
  it("allows the exact 366-day bound and normalizes a shareable management URL", () => {
    const filters = {
      ...defaults,
      from: "2024-01-01",
      toExclusive: "2025-01-01",
      limit: 10,
      months: 12,
    };
    expect(dashboardFilterError("management", filters)).toBeNull();
    expect(
      readDashboardSelection(
        new URLSearchParams(
          dashboardUrl({ audience: "management", filters }).split("?")[1],
        ),
        "employee",
        defaults,
      ),
    ).toEqual({ audience: "management", filters, error: null });
  });
  it("clears analytics parameters when switching to employee", () => {
    const url = dashboardUrl({
      audience: "employee",
      filters: {
        ...defaults,
        from: "2026-01-01",
        toExclusive: "2026-02-01",
        promotionCampaignId: "campaign",
      },
    });
    expect(url).not.toMatch(/from=|months=|promotionCampaignId=/);
    expect(url).toContain("limit=5");
  });
});
