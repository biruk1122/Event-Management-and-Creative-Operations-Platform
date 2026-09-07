import { describe, expect, it } from "vitest";

import { displayName } from "./users-types";

describe("displayName", () => {
  it("joins first and last name", () => {
    expect(displayName({ firstName: "Ada", lastName: "Lovelace" })).toBe(
      "Ada Lovelace",
    );
  });

  it("uses whichever part is present", () => {
    expect(displayName({ firstName: "Ada", lastName: null })).toBe("Ada");
    expect(displayName({ firstName: null, lastName: "Lovelace" })).toBe(
      "Lovelace",
    );
  });

  it("falls back when neither part is set", () => {
    expect(displayName({ firstName: null, lastName: null })).toBe(
      "Unnamed user",
    );
  });
});
