import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chartColor, useChartAnimationDuration } from "./analytics-chart-kit";

describe("chartColor", () => {
  it("cycles through the 5 chart tokens as unresolved var() literals - every chart component below colors its marks by calling this function directly, so they never resolve or hardcode a color themselves, and stay correct across the light/dark toggle with no re-render", () => {
    expect(chartColor(0)).toBe("var(--chart-1)");
    expect(chartColor(4)).toBe("var(--chart-5)");
    expect(chartColor(5)).toBe("var(--chart-1)");
  });
});

describe("useChartAnimationDuration", () => {
  const originalMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("returns a non-zero duration when reduced motion is not requested", () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const { result } = renderHook(() => useChartAnimationDuration());
    expect(result.current).toBeGreaterThan(0);
  });

  it("returns 0 when the viewer has requested reduced motion", () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const { result } = renderHook(() => useChartAnimationDuration());
    expect(result.current).toBe(0);
  });
});
