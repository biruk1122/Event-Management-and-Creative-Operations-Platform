import { describe, expect, it } from "vitest";

import {
  activityStatusLabel,
  budgetSummary,
  campaignStatusLabel,
  campaignTypeLabel,
  NEXT_STATUSES,
  personName,
  progressOf,
  progressSummary,
  scheduleSummary,
  subjectSummary,
} from "./campaigns-types";

describe("campaigns-types helpers", () => {
  it("prefers a full name and falls back to the email", () => {
    expect(
      personName({ firstName: "Dana", lastName: "Okafor", email: "d@x.co" }),
    ).toBe("Dana Okafor");
    expect(
      personName({ firstName: null, lastName: null, email: "d@x.co" }),
    ).toBe("d@x.co");
  });

  it("labels every type and status", () => {
    expect(campaignTypeLabel("MARKETING")).toBe("Marketing");
    expect(campaignTypeLabel("PROMOTION")).toBe("Promotion");
    expect(campaignStatusLabel("ACTIVE")).toBe("Active");
    expect(activityStatusLabel("IN_PROGRESS")).toBe("In progress");
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
    expect(
      scheduleSummary({ startAt: null, endAt: "2026-10-01T18:00:00.000Z" }),
    ).toMatch(/^Until /);
    expect(scheduleSummary({ startAt: null, endAt: null })).toBe(
      "Not scheduled",
    );
  });

  it("summarises a budget only when both parts are present", () => {
    expect(budgetSummary({ amount: "25000.00", currency: "USD" })).toBe(
      "25000.00 USD",
    );
    expect(budgetSummary({ amount: null, currency: null })).toBe("—");
    expect(budgetSummary(null)).toBe("—");
  });

  it("treats COMPLETED and CANCELLED as terminal and offers the approved moves", () => {
    expect(NEXT_STATUSES.COMPLETED).toEqual([]);
    expect(NEXT_STATUSES.CANCELLED).toEqual([]);
    expect(NEXT_STATUSES.PLANNED).toEqual(["ACTIVE", "CANCELLED"]);
    expect(NEXT_STATUSES.ACTIVE).toEqual(["COMPLETED", "CANCELLED"]);
  });

  describe("progress", () => {
    it("is empty with no activities", () => {
      expect(progressOf([])).toEqual({
        completedActivities: 0,
        totalActivities: 0,
        percent: null,
      });
    });

    it("counts completed against every non-cancelled activity", () => {
      expect(
        progressOf([
          { status: "COMPLETED" },
          { status: "IN_PROGRESS" },
          { status: "PLANNED" },
        ]),
      ).toEqual({ completedActivities: 1, totalActivities: 3, percent: 33 });
    });

    it("rounds to a whole percent and excludes cancelled activities", () => {
      expect(
        progressOf([
          { status: "COMPLETED" },
          { status: "COMPLETED" },
          { status: "PLANNED" },
          { status: "CANCELLED" },
        ]),
      ).toEqual({ completedActivities: 2, totalActivities: 3, percent: 67 });
    });

    it("is null when every activity is cancelled", () => {
      expect(progressOf([{ status: "CANCELLED" }]).percent).toBeNull();
    });

    it("words the summary from the counts, or says nothing counts yet", () => {
      expect(
        progressSummary({
          completedActivities: 3,
          totalActivities: 8,
          percent: 38,
        }),
      ).toBe("3 of 8 activities · 38%");
      expect(
        progressSummary({
          completedActivities: 0,
          totalActivities: 0,
          percent: null,
        }),
      ).toBe("No activities counted yet");
    });
  });

  describe("subject summary", () => {
    const events = [{ id: "e1", name: "Aurora Premiere" }];

    it("names the product, the event, or nothing", () => {
      expect(
        subjectSummary({ eventId: null, productName: "Orbit" }, events),
      ).toBe("Product: Orbit");
      expect(subjectSummary({ eventId: "e1", productName: null }, events)).toBe(
        "Event: Aurora Premiere",
      );
      expect(subjectSummary({ eventId: null, productName: null }, events)).toBe(
        "No related subject",
      );
    });

    it("does not break on an event the picker no longer offers", () => {
      expect(
        subjectSummary({ eventId: "gone", productName: null }, events),
      ).toBe("Event: Unknown event");
    });
  });
});
