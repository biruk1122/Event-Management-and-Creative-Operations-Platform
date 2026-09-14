import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RealtimeRateLimiter } from "./realtime.rate-limiter.js";

function makeLimiter(max: number, windowMs: number): RealtimeRateLimiter {
  return new RealtimeRateLimiter({
    REALTIME_COMMAND_RATE_LIMIT_MAX: max,
    REALTIME_COMMAND_RATE_LIMIT_WINDOW_MS: windowMs,
  } as never);
}

describe("RealtimeRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to the configured maximum within a window", () => {
    const limiter = makeLimiter(3, 10_000);
    expect(limiter.consume("s1")).toBe(true);
    expect(limiter.consume("s1")).toBe(true);
    expect(limiter.consume("s1")).toBe(true);
    expect(limiter.consume("s1")).toBe(false);
  });

  it("tracks each key independently", () => {
    const limiter = makeLimiter(1, 10_000);
    expect(limiter.consume("s1")).toBe(true);
    expect(limiter.consume("s2")).toBe(true);
    expect(limiter.consume("s1")).toBe(false);
    expect(limiter.consume("s2")).toBe(false);
  });

  it("resets the window after it elapses", () => {
    const limiter = makeLimiter(1, 10_000);
    expect(limiter.consume("s1")).toBe(true);
    expect(limiter.consume("s1")).toBe(false);

    vi.advanceTimersByTime(10_001);

    expect(limiter.consume("s1")).toBe(true);
  });

  it("reset() clears a key's window early", () => {
    const limiter = makeLimiter(1, 10_000);
    expect(limiter.consume("s1")).toBe(true);
    expect(limiter.consume("s1")).toBe(false);

    limiter.reset("s1");

    expect(limiter.consume("s1")).toBe(true);
  });
});
