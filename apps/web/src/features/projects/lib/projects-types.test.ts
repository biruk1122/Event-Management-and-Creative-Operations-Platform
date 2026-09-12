import { describe, expect, it } from "vitest";

import {
  NEXT_STATUSES,
  personName,
  projectStatusLabel,
  scheduleSummary,
} from "./projects-types";

describe("projects-types helpers", () => {
  it("prefers a full name and falls back to the email", () => {
    expect(
      personName({ firstName: "Dana", lastName: "Okafor", email: "d@x.co" }),
    ).toBe("Dana Okafor");
    expect(
      personName({ firstName: null, lastName: null, email: "d@x.co" }),
    ).toBe("d@x.co");
  });

  it("labels every status", () => {
    expect(projectStatusLabel("PLANNED")).toBe("Planned");
    expect(projectStatusLabel("ACTIVE")).toBe("Active");
  });

  it("summarises a schedule for both, one, or neither end", () => {
    expect(
      scheduleSummary({
        startAt: "2026-10-01T18:00:00.000Z",
        endAt: "2026-10-02T02:00:00.000Z",
      }),
    ).toContain("–");
    expect(
      scheduleSummary({ startAt: "2026-10-01T18:00:00.000Z", endAt: null }),
    ).toMatch(/^From /);
    expect(scheduleSummary({ startAt: null, endAt: null })).toBe(
      "Not scheduled",
    );
  });

  it("treats COMPLETED and CANCELLED as terminal", () => {
    expect(NEXT_STATUSES.COMPLETED).toEqual([]);
    expect(NEXT_STATUSES.CANCELLED).toEqual([]);
    expect(NEXT_STATUSES.PLANNED).toContain("ACTIVE");
    expect(NEXT_STATUSES.ACTIVE).toContain("COMPLETED");
  });
});
