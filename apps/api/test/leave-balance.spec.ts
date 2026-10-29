import { describe, expect, it } from "vitest";

import {
  inclusiveDaySpan,
  planConsumption,
  twoYearsLater,
} from "../src/leave/leave-balance.js";

describe("twoYearsLater", () => {
  it("adds exactly two calendar years", () => {
    expect(twoYearsLater(new Date("2026-03-15T09:00:00Z")).toISOString()).toBe(
      "2028-03-15T09:00:00.000Z",
    );
  });

  it("handles a leap-day grant by rolling forward when the target year has no Feb 29", () => {
    // 2024 is a leap year; 2026 is not, so Date normalizes Feb 29 -> Mar 1.
    const result = twoYearsLater(new Date("2024-02-29T00:00:00Z"));
    expect(result.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("inclusiveDaySpan", () => {
  it("counts a single day as 1", () => {
    const day = new Date("2026-12-24T00:00:00Z");
    expect(inclusiveDaySpan(day, day)).toBe(1);
  });

  it("counts a 3-day range inclusively", () => {
    expect(
      inclusiveDaySpan(new Date("2026-12-24T00:00:00Z"), new Date("2026-12-26T00:00:00Z")),
    ).toBe(3);
  });
});

describe("planConsumption", () => {
  it("draws entirely from the oldest grant when it has enough balance", () => {
    const plan = planConsumption(
      [
        { grantId: "old", remaining: 10 },
        { grantId: "new", remaining: 10 },
      ],
      5,
    );
    expect(plan).toEqual([{ grantId: "old", amountDays: -5 }]);
  });

  it("spills over into the next grant when the oldest is insufficient", () => {
    const plan = planConsumption(
      [
        { grantId: "old", remaining: 3 },
        { grantId: "new", remaining: 10 },
      ],
      5,
    );
    expect(plan).toEqual([
      { grantId: "old", amountDays: -3 },
      { grantId: "new", amountDays: -2 },
    ]);
  });

  it("skips an exhausted grant entirely", () => {
    const plan = planConsumption(
      [
        { grantId: "exhausted", remaining: 0 },
        { grantId: "next", remaining: 5 },
      ],
      5,
    );
    expect(plan).toEqual([{ grantId: "next", amountDays: -5 }]);
  });

  it("returns insufficient_balance when every non-expired grant combined falls short", () => {
    const plan = planConsumption(
      [
        { grantId: "a", remaining: 2 },
        { grantId: "b", remaining: 1 },
      ],
      5,
    );
    expect(plan).toBe("insufficient_balance");
  });

  it("returns an empty plan for zero days requested", () => {
    expect(planConsumption([{ grantId: "a", remaining: 10 }], 0)).toEqual([]);
  });
});
