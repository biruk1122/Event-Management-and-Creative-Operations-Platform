import { describe, expect, it } from "vitest";

import {
  hasInAppPrevious,
  NAVIGATION_TRAIL_KEY,
  readTrail,
  recordVisit,
  writeTrail,
} from "./navigation-trail";

describe("recordVisit", () => {
  it("appends a new page and ignores a repeat of the current page", () => {
    const first = recordVisit([], "/talent");
    const second = recordVisit(first, "/talent/t1");
    expect(second).toEqual(["/talent", "/talent/t1"]);
    expect(recordVisit(second, "/talent/t1")).toEqual(second);
  });

  it("pops when the user returns to the previous page, so back and forward stay in step", () => {
    const trail = ["/talent", "/talent/t1"];
    expect(recordVisit(trail, "/talent")).toEqual(["/talent"]);
  });

  it("keeps only the most recent entries", () => {
    let trail: string[] = [];
    for (let index = 0; index < 60; index += 1) {
      trail = recordVisit(trail, `/page/${index}`);
    }
    expect(trail).toHaveLength(50);
    expect(trail.at(-1)).toBe("/page/59");
  });
});

describe("hasInAppPrevious", () => {
  it("is false for a direct visit and true once an earlier page exists", () => {
    expect(hasInAppPrevious([])).toBe(false);
    expect(hasInAppPrevious(["/tasks/t1"])).toBe(false);
    expect(hasInAppPrevious(["/tasks", "/tasks/t1"])).toBe(true);
  });
});

describe("readTrail and writeTrail", () => {
  it("round-trips the trail through storage", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    writeTrail(storage, ["/letters", "/letters/l1"]);
    expect(store.get(NAVIGATION_TRAIL_KEY)).toBe(
      JSON.stringify(["/letters", "/letters/l1"]),
    );
    expect(readTrail(storage)).toEqual(["/letters", "/letters/l1"]);
  });

  it("treats malformed storage as an empty trail", () => {
    expect(readTrail({ getItem: () => "{not json" })).toEqual([]);
    expect(readTrail({ getItem: () => JSON.stringify([1, 2]) })).toEqual([]);
    expect(readTrail({ getItem: () => null })).toEqual([]);
  });

  it("ignores storage that refuses to write", () => {
    expect(() =>
      writeTrail(
        {
          setItem: () => {
            throw new Error("quota");
          },
        },
        ["/tasks"],
      ),
    ).not.toThrow();
  });
});
