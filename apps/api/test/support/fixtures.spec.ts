import { afterEach, describe, expect, it, vi } from "vitest";

import { useTestClock } from "./clock.js";
import { fixtureName, userFixture } from "./fixtures.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("test boundary fixtures", () => {
  it("creates minimal, unique user fixtures", () => {
    const first = userFixture();
    const second = userFixture();

    expect(first.email).toMatch(/@test\.invalid$/);
    expect(Object.keys(first)).toEqual(["email"]);
    expect(second.email).not.toEqual(first.email);
    expect(fixtureName("department manager")).toMatch(/^department-manager-/);
  });

  it("freezes and advances time deterministically", () => {
    const clock = useTestClock("2025-01-01T00:00:00.000Z");

    expect(clock.now().toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(clock.advanceBy(90_000).toISOString()).toBe(
      "2025-01-01T00:01:30.000Z",
    );
    clock.restore();
  });
});
