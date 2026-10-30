import { describe, expect, it } from "vitest";

import { computeScheduleDeltas } from "../src/attendance/infrastructure/attendance.repository.js";

describe("computeScheduleDeltas", () => {
  it("returns all zeros when there is no planned window (office kiosk)", () => {
    expect(
      computeScheduleDeltas({
        plannedStartAt: null,
        plannedEndAt: null,
        checkInAt: new Date("2026-11-01T08:00:00Z"),
        checkOutAt: new Date("2026-11-01T17:00:00Z"),
      }),
    ).toEqual({
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
      potentialOvertimeMinutes: 0,
    });
  });

  it("is zero across the board for an on-time, on-schedule shift", () => {
    const result = computeScheduleDeltas({
      plannedStartAt: new Date("2026-11-01T18:00:00Z"),
      plannedEndAt: new Date("2026-11-02T02:00:00Z"),
      checkInAt: new Date("2026-11-01T18:00:00Z"),
      checkOutAt: new Date("2026-11-02T02:00:00Z"),
    });
    expect(result).toEqual({
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
      potentialOvertimeMinutes: 0,
    });
  });

  it("computes late minutes for a check-in after the planned start", () => {
    const result = computeScheduleDeltas({
      plannedStartAt: new Date("2026-11-01T18:00:00Z"),
      plannedEndAt: new Date("2026-11-02T02:00:00Z"),
      checkInAt: new Date("2026-11-01T18:15:00Z"),
      checkOutAt: new Date("2026-11-02T02:00:00Z"),
    });
    expect(result.lateMinutes).toBe(15);
  });

  it("never reports negative late minutes for an early check-in", () => {
    const result = computeScheduleDeltas({
      plannedStartAt: new Date("2026-11-01T18:00:00Z"),
      plannedEndAt: new Date("2026-11-02T02:00:00Z"),
      checkInAt: new Date("2026-11-01T17:45:00Z"),
      checkOutAt: new Date("2026-11-02T02:00:00Z"),
    });
    expect(result.lateMinutes).toBe(0);
  });

  it("computes early-departure minutes for a checkout before the planned end", () => {
    const result = computeScheduleDeltas({
      plannedStartAt: new Date("2026-11-01T18:00:00Z"),
      plannedEndAt: new Date("2026-11-02T02:00:00Z"),
      checkInAt: new Date("2026-11-01T18:00:00Z"),
      checkOutAt: new Date("2026-11-02T01:30:00Z"),
    });
    expect(result.earlyDepartureMinutes).toBe(30);
    expect(result.potentialOvertimeMinutes).toBe(0);
  });

  it("computes potential overtime for a checkout after the planned end, crossing midnight", () => {
    const result = computeScheduleDeltas({
      plannedStartAt: new Date("2026-11-01T18:00:00Z"),
      plannedEndAt: new Date("2026-11-02T02:00:00Z"),
      checkInAt: new Date("2026-11-01T18:00:00Z"),
      checkOutAt: new Date("2026-11-02T03:20:00Z"),
    });
    expect(result.potentialOvertimeMinutes).toBe(80);
    expect(result.earlyDepartureMinutes).toBe(0);
  });
});
