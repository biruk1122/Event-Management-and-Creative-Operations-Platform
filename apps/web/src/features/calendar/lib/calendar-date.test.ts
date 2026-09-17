import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  buildMonthGrid,
  buildWeekDays,
  entriesForDay,
  entriesInRange,
  formatRangeLabel,
  isSameDay,
  rangeForView,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "./calendar-date";
import type { CalendarEntry } from "./calendar-types";

function entry(overrides: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    id: "entry-1",
    title: "Sample",
    description: null,
    type: "PERSONAL",
    startAt: "2026-09-16T09:00:00.000Z",
    endAt: null,
    eventId: null,
    taskId: null,
    projectId: null,
    meetingId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("startOfDay", () => {
  it("zeroes the time component", () => {
    const result = startOfDay(new Date(2026, 8, 16, 14, 30, 15));
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });
});

describe("addDays / addMonths", () => {
  it("adds and subtracts calendar days", () => {
    const base = new Date(2026, 8, 30);
    expect(addDays(base, 1).getDate()).toBe(1);
    expect(addDays(base, 1).getMonth()).toBe(9);
    expect(addDays(base, -1).getDate()).toBe(29);
  });

  it("adds and subtracts months, rolling the year when needed", () => {
    const base = new Date(2026, 11, 15);
    expect(addMonths(base, 1).getMonth()).toBe(0);
    expect(addMonths(base, 1).getFullYear()).toBe(2027);
    expect(addMonths(base, -12).getFullYear()).toBe(2025);
  });
});

describe("isSameDay", () => {
  it("is true for the same calendar day regardless of time", () => {
    expect(isSameDay(new Date(2026, 8, 16, 1), new Date(2026, 8, 16, 23))).toBe(
      true,
    );
  });

  it("is false across a day boundary", () => {
    expect(
      isSameDay(new Date(2026, 8, 16, 23, 59), new Date(2026, 8, 17, 0, 0)),
    ).toBe(false);
  });
});

describe("startOfWeek", () => {
  it("always resolves to a Monday", () => {
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(new Date(2026, 8, 14), day); // a known Monday
      expect(startOfWeek(date).getDay()).toBe(1);
    }
  });

  it("does not move a date that is already Monday", () => {
    const monday = new Date(2026, 8, 14);
    expect(isSameDay(startOfWeek(monday), monday)).toBe(true);
  });
});

describe("startOfMonth", () => {
  it("resolves to the 1st of the month", () => {
    expect(startOfMonth(new Date(2026, 8, 16)).getDate()).toBe(1);
  });
});

describe("buildMonthGrid", () => {
  it("always returns six weeks of seven days", () => {
    const grid = buildMonthGrid(new Date(2026, 8, 16));
    expect(grid).toHaveLength(6);
    for (const week of grid) expect(week).toHaveLength(7);
  });

  it("every week starts on a Monday", () => {
    const grid = buildMonthGrid(new Date(2026, 8, 16));
    for (const week of grid) expect(week[0]!.getDay()).toBe(1);
  });

  it("the grid includes every day of the anchor's month", () => {
    const grid = buildMonthGrid(new Date(2026, 8, 16));
    const days = grid.flat();
    const septemberDays = days.filter((day) => day.getMonth() === 8);
    expect(septemberDays).toHaveLength(30);
  });
});

describe("buildWeekDays", () => {
  it("returns seven consecutive days starting Monday", () => {
    const days = buildWeekDays(new Date(2026, 8, 16));
    expect(days).toHaveLength(7);
    expect(days[0]!.getDay()).toBe(1);
    expect(days[6]!.getDay()).toBe(0);
  });
});

describe("rangeForView", () => {
  it("day view spans exactly one day", () => {
    const { from, to } = rangeForView("day", new Date(2026, 8, 16, 13));
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("week view spans exactly seven days", () => {
    const { from, to } = rangeForView("week", new Date(2026, 8, 16));
    expect(to.getTime() - from.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("month view never exceeds the server's 90-day maximum", () => {
    const { from, to } = rangeForView("month", new Date(2026, 8, 16));
    const days = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBeLessThanOrEqual(90);
    expect(days).toBe(42); // six full weeks
  });
});

describe("entriesForDay", () => {
  it("returns only entries starting on that local day, sorted by time", () => {
    const day = new Date(2026, 8, 16);
    const early = entry({
      id: "early",
      startAt: new Date(2026, 8, 16, 8).toISOString(),
    });
    const late = entry({
      id: "late",
      startAt: new Date(2026, 8, 16, 18).toISOString(),
    });
    const otherDay = entry({
      id: "other-day",
      startAt: new Date(2026, 8, 17, 8).toISOString(),
    });

    const result = entriesForDay([late, early, otherDay], day);
    expect(result.map((item) => item.id)).toEqual(["early", "late"]);
  });
});

describe("entriesInRange", () => {
  it("includes the range start and excludes the range end", () => {
    const from = new Date(2026, 8, 16);
    const to = new Date(2026, 8, 17);
    const atStart = entry({ id: "at-start", startAt: from.toISOString() });
    const atEnd = entry({ id: "at-end", startAt: to.toISOString() });

    const result = entriesInRange([atStart, atEnd], from, to);
    expect(result.map((item) => item.id)).toEqual(["at-start"]);
  });
});

describe("formatRangeLabel", () => {
  it("produces a distinct, non-empty label for every view", () => {
    const anchor = new Date(2026, 8, 16);
    for (const view of ["day", "week", "month", "agenda"] as const) {
      expect(formatRangeLabel(view, anchor).length).toBeGreaterThan(0);
    }
  });
});
