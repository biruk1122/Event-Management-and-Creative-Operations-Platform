import { describe, expect, it } from "vitest";

import { addDaysToDateOnly, formatDueDate, toDateOnly } from "./todo-date";

describe("toDateOnly", () => {
  it("formats local date components as YYYY-MM-DD", () => {
    expect(toDateOnly(new Date(2026, 8, 5))).toBe("2026-09-05");
  });
});

describe("addDaysToDateOnly", () => {
  it("adds and subtracts days, rolling the month when needed", () => {
    expect(addDaysToDateOnly("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysToDateOnly("2026-09-01", -1)).toBe("2026-08-31");
  });
});

describe("formatDueDate", () => {
  it("formats a date-only due date without a time", () => {
    expect(formatDueDate("2026-10-01", null)).toBe("Oct 1");
  });

  it("includes the time when one is set", () => {
    expect(formatDueDate("2026-10-01", "09:30:00")).toBe("Oct 1, 9:30 AM");
  });
});
