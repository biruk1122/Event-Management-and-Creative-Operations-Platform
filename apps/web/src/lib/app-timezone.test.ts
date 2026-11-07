import { describe, expect, it } from "vitest";

import {
  formatInZone,
  utcToZonedLocal,
  zonedLocalToUtcIso,
} from "./app-timezone";

describe("app timezone conversions", () => {
  it("reads a wall-clock time in Addis Ababa as UTC, three hours earlier", () => {
    expect(zonedLocalToUtcIso("2026-10-04T18:00")).toBe(
      "2026-10-04T15:00:00.000Z",
    );
    expect(zonedLocalToUtcIso("2026-10-04T01:30")).toBe(
      "2026-10-03T22:30:00.000Z",
    );
  });

  it("gives the wall-clock time back from a UTC instant", () => {
    expect(utcToZonedLocal("2026-10-04T15:00:00.000Z")).toBe(
      "2026-10-04T18:00",
    );
  });

  it("round-trips a value through UTC unchanged", () => {
    const local = "2026-12-31T23:45";
    expect(utcToZonedLocal(zonedLocalToUtcIso(local)!)).toBe(local);
  });

  it("respects a different configured zone", () => {
    expect(zonedLocalToUtcIso("2026-10-04T18:00", "UTC")).toBe(
      "2026-10-04T18:00:00.000Z",
    );
    expect(
      formatInZone(
        "2026-10-04T15:00:00.000Z",
        { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
        "America/New_York",
      ),
    ).toBe("11:00");
  });

  it("returns null for an incomplete wall-clock value", () => {
    expect(zonedLocalToUtcIso("")).toBeNull();
    expect(zonedLocalToUtcIso("2026-10-04")).toBeNull();
  });
});
