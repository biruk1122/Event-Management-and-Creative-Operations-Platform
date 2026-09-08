import { describe, expect, it } from "vitest";

import { activityOf, personName } from "./teams-types";

describe("personName", () => {
  it("joins first and last name", () => {
    expect(
      personName({
        firstName: "Dana",
        lastName: "Okafor",
        email: "dana@example.com",
      }),
    ).toBe("Dana Okafor");
  });

  it("uses whichever part is present", () => {
    expect(
      personName({ firstName: "Dana", lastName: null, email: "d@x.com" }),
    ).toBe("Dana");
  });

  it("falls back to the email when there is no name", () => {
    expect(
      personName({ firstName: null, lastName: null, email: "d@example.com" }),
    ).toBe("d@example.com");
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
