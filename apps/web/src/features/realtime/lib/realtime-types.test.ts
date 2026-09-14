import { describe, expect, it } from "vitest";

import {
  isRecoverable,
  REALTIME_STATUSES,
  statusLabel,
} from "./realtime-types";

describe("statusLabel", () => {
  it("returns a distinct, non-empty label for every status", () => {
    const labels = REALTIME_STATUSES.map(statusLabel);
    expect(new Set(labels).size).toBe(REALTIME_STATUSES.length);
    for (const label of labels) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe("isRecoverable", () => {
  it("offers recovery only for denied and error", () => {
    expect(isRecoverable("denied")).toBe(true);
    expect(isRecoverable("error")).toBe(true);
    expect(isRecoverable("disabled")).toBe(false);
    expect(isRecoverable("connecting")).toBe(false);
    expect(isRecoverable("connected")).toBe(false);
    expect(isRecoverable("reconnecting")).toBe(false);
  });
});
