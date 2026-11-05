import { describe, expect, it } from "vitest";

import {
  booleanCodec,
  enumCodec,
  nullableEnumCodec,
  positiveIntCodec,
  stringCodec,
} from "./url-state";

describe("url state codecs", () => {
  it("keeps default values out of the URL and restores them from it", () => {
    expect(stringCodec.serialize("", "")).toBeNull();
    expect(stringCodec.serialize("budget", "")).toBe("budget");
    expect(stringCodec.parse(null, "")).toBe("");
    expect(stringCodec.parse("budget", "")).toBe("budget");
  });

  it("rejects an enum value that is not one of the allowed values", () => {
    const codec = enumCodec(["name", "newest"] as const);
    expect(codec.parse("newest", "name")).toBe("newest");
    expect(codec.parse("hacked", "name")).toBe("name");
    expect(codec.serialize("name", "name")).toBeNull();
    const nullable = nullableEnumCodec(["ARTIST", "ACTOR"] as const);
    expect(nullable.parse("ACTOR", null)).toBe("ACTOR");
    expect(nullable.parse("MUSICIAN", null)).toBeNull();
    expect(nullable.serialize(null, null)).toBeNull();
  });

  it("stores flags as 1 and drops them when they return to the default", () => {
    expect(booleanCodec.serialize(true, false)).toBe("1");
    expect(booleanCodec.serialize(false, false)).toBeNull();
    expect(booleanCodec.parse("1", false)).toBe(true);
    expect(booleanCodec.parse(null, false)).toBe(false);
  });

  it("accepts only positive whole numbers for pages", () => {
    expect(positiveIntCodec.parse("3", 1)).toBe(3);
    expect(positiveIntCodec.parse("0", 1)).toBe(1);
    expect(positiveIntCodec.parse("-2", 1)).toBe(1);
    expect(positiveIntCodec.parse("2.5", 1)).toBe(1);
    expect(positiveIntCodec.parse("abc", 1)).toBe(1);
    expect(positiveIntCodec.serialize(1, 1)).toBeNull();
    expect(positiveIntCodec.serialize(4, 1)).toBe("4");
  });
});
