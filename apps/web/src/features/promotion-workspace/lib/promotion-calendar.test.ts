import { describe, expect, it } from "vitest";

import {
  dayKey,
  groupEntriesByDay,
  inMonth,
  monthGrid,
  monthOf,
  monthRange,
  shiftMonth,
} from "./promotion-calendar";

const ADDIS = "Africa/Addis_Ababa";

describe("promotion calendar dates (EVE-234)", () => {
  it("reads the month and day in the app timezone, not UTC", () => {
    // 22:30 UTC on Oct 31 is already Nov 1 in Addis Ababa (UTC+3).
    expect(monthOf("2026-10-31T22:30:00.000Z", ADDIS)).toEqual({
      year: 2026,
      month: 11,
    });
    expect(dayKey("2026-10-31T22:30:00.000Z", ADDIS)).toBe("2026-11-01");
    expect(
      inMonth("2026-10-31T22:30:00.000Z", { year: 2026, month: 11 }, ADDIS),
    ).toBe(true);
  });

  it("spans the whole local month", () => {
    expect(monthRange({ year: 2026, month: 11 }, ADDIS)).toEqual({
      from: "2026-10-31T21:00:00.000Z",
      to: "2026-11-30T20:59:59.999Z",
    });
  });

  it("moves across years", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({
      year: 2027,
      month: 1,
    });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({
      year: 2025,
      month: 12,
    });
  });

  it("lays the month out in Monday-first weeks", () => {
    // November 2026 starts on a Sunday.
    const weeks = monthGrid({ year: 2026, month: 11 });
    expect(weeks[0]).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      "2026-11-01",
    ]);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
  });

  it("groups entries by local day in time order", () => {
    const groups = groupEntriesByDay(
      [
        {
          id: "b",
          kind: "deadline",
          title: "Poster due",
          at: "2026-11-02T09:00:00.000Z",
          detail: "",
        },
        {
          id: "a",
          kind: "event",
          title: "Launch",
          at: "2026-11-02T06:00:00.000Z",
          detail: "",
        },
        {
          id: "c",
          kind: "activity",
          title: "Flyers",
          at: "2026-11-01T08:00:00.000Z",
          detail: "",
        },
      ],
      ADDIS,
    );
    expect([...groups.keys()]).toEqual(["2026-11-01", "2026-11-02"]);
    expect(groups.get("2026-11-02")!.map((entry) => entry.id)).toEqual([
      "a",
      "b",
    ]);
  });
});
