import { vi } from "vitest";

export interface TestClock {
  advanceBy: (milliseconds: number) => Date;
  now: () => Date;
  restore: () => void;
  set: (instant: Date | number | string) => Date;
}

/**
 * Freezes JavaScript time at a test boundary. Tests must call `restore` in
 * teardown so no clock state can leak to a later spec.
 */
export function useTestClock(
  initialInstant: Date | number | string = "2025-01-01T00:00:00.000Z",
): TestClock {
  vi.useFakeTimers();

  const set = (instant: Date | number | string): Date => {
    const value = new Date(instant);
    if (Number.isNaN(value.getTime())) {
      throw new Error("Test clock requires a valid instant.");
    }
    vi.setSystemTime(value);
    return new Date(value);
  };

  set(initialInstant);

  return {
    advanceBy(milliseconds) {
      if (!Number.isFinite(milliseconds)) {
        throw new Error("Test clock advance must be finite.");
      }
      return set(Date.now() + milliseconds);
    },
    now: () => new Date(),
    restore: () => vi.useRealTimers(),
    set,
  };
}
