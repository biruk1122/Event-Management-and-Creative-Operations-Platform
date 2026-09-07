import { describe, expect, it } from "vitest";

import { activityOf, personName } from "./departments-types";

describe("personName", () => {
  it("joins first and last name", () => {
    expect(
      personName({
        firstName: "Morgan",
        lastName: "Lead",
        email: "morgan@example.com",
      }),
    ).toBe("Morgan Lead");
  });

  it("uses whichever part is present", () => {
    expect(
      personName({ firstName: "Morgan", lastName: null, email: "m@x.com" }),
    ).toBe("Morgan");
  });

  it("falls back to the email when there is no name", () => {
    expect(
      personName({ firstName: null, lastName: null, email: "m@example.com" }),
    ).toBe("m@example.com");
  });
});

describe("activityOf", () => {
  it("is ACTIVE when there is no deactivation marker", () => {
    expect(activityOf({ deactivatedAt: null })).toBe("ACTIVE");
  });

  it("is INACTIVE once the deactivation marker is set", () => {
    expect(activityOf({ deactivatedAt: "2026-08-20T12:00:00.000Z" })).toBe(
      "INACTIVE",
    );
  });
});
