import { describe, expect, it } from "vitest";

import {
  budgetSummary,
  eventStatusLabel,
  eventTypeLabel,
  NEXT_STATUSES,
  personName,
  scheduleSummary,
} from "./events-types";

describe("events-types helpers", () => {
  it("prefers a full name and falls back to the email", () => {
    expect(
      personName({ firstName: "Dana", lastName: "Okafor", email: "d@x.co" }),
    ).toBe("Dana Okafor");
    expect(
      personName({ firstName: null, lastName: null, email: "d@x.co" }),
    ).toBe("d@x.co");
  });

  it("labels every type and status", () => {
    expect(eventTypeLabel("PRODUCT_LAUNCH")).toBe("Product launch");
    expect(eventStatusLabel("IN_PROGRESS")).toBe("In progress");
  });

  it("summarises a schedule for both, one, or neither end", () => {
    expect(
      scheduleSummary({
        startAt: "2026-10-01T18:00:00.000Z",
        endAt: "2026-10-02T02:00:00.000Z",
      }),
    ).toContain("–");
    expect(
      scheduleSummary({ startAt: "2026-10-01T18:00:00.000Z", endAt: null }),
    ).toMatch(/^From /);
    expect(scheduleSummary({ startAt: null, endAt: null })).toBe(
      "Not scheduled",
    );
  });

  it("summarises a budget only when both parts are present", () => {
    expect(budgetSummary({ amount: "15000.00", currency: "USD" })).toBe(
      "15000.00 USD",
    );
    expect(budgetSummary({ amount: null, currency: null })).toBe("—");
    expect(budgetSummary(null)).toBe("—");
  });

  it("treats COMPLETED and CANCELLED as terminal", () => {
    expect(NEXT_STATUSES.COMPLETED).toEqual([]);
    expect(NEXT_STATUSES.CANCELLED).toEqual([]);
    expect(NEXT_STATUSES.PLANNING).toContain("READY");
  });
});
