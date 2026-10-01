import { describe, expect, it } from "vitest";

import {
  parsePeriod,
  validateSections,
  validateSubmission,
} from "./reports.policy.js";

describe("report period and content policy", () => {
  it("accepts exact daily, seven-day weekly, and calendar-month periods", () => {
    expect(
      parsePeriod("DAILY", "2026-09-30", "2026-09-30").from.toISOString(),
    ).toBe("2026-09-30T00:00:00.000Z");
    expect(
      parsePeriod("WEEKLY", "2026-09-24", "2026-09-30").to.toISOString(),
    ).toBe("2026-09-30T00:00:00.000Z");
    expect(
      parsePeriod("MONTHLY", "2024-02-01", "2024-02-29").to.toISOString(),
    ).toBe("2024-02-29T00:00:00.000Z");
  });

  it("rejects invalid calendar dates and type-incompatible periods", () => {
    expect(() => parsePeriod("DAILY", "2026-02-30", "2026-02-30")).toThrow();
    expect(() => parsePeriod("WEEKLY", "2026-09-01", "2026-09-08")).toThrow();
    expect(() => parsePeriod("MONTHLY", "2026-09-02", "2026-09-30")).toThrow();
  });

  it("allows partial drafts but requires applicable sections at submission", () => {
    expect(() =>
      validateSections("DAILY", { nextDayPlan: "Tomorrow" }),
    ).not.toThrow();
    expect(() =>
      validateSubmission("DAILY", { nextDayPlan: "Tomorrow" }),
    ).toThrow();
    expect(() =>
      validateSubmission("DAILY", {
        nextDayPlan: "Tomorrow",
        problemsEncountered: "None",
      }),
    ).not.toThrow();
    expect(() =>
      validateSections("DAILY", { challenges: "Wrong type" }),
    ).toThrow();
    expect(() => validateSections("WEEKLY", { challenges: "   " })).toThrow();
  });
});
