import { describe, expect, it } from "vitest";
import type { components } from "@event-platform/api-client";
import {
  analyticsAbilities,
  filterError,
  type AnalyticsFilters,
} from "./analytics-presentation";

const valid: AnalyticsFilters = {
  from: "2024-01-01",
  toExclusive: "2025-01-01",
  subjectId: "",
  pageSize: 25,
};
describe("analytics input and scope presentation", () => {
  it("matches scoped grants instead of role names or dashboard access", () => {
    const access = {
      grants: [
        { permissionKey: "dashboard.management.read", scope: "ORGANIZATION" },
        {
          permissionKey: "analytics.department_performance.read",
          scope: "DEPARTMENT",
        },
        { permissionKey: "analytics.employee_performance.read", scope: "SELF" },
      ],
    } as components["schemas"]["CurrentAccessResponse"];
    expect(analyticsAbilities(access)).toEqual({
      tasks: false,
      events: false,
      campaigns: false,
      promotion: false,
      monthly: false,
      departments: true,
      employees: false,
    });
  });
  it.each(["ORGANIZATION", "MANAGEMENT"] as const)(
    "permits exact management grants at %s",
    (scope) => {
      const access = {
        grants: [{ permissionKey: "analytics.management.read", scope }],
      } as components["schemas"]["CurrentAccessResponse"];
      expect(analyticsAbilities(access).tasks).toBe(true);
      expect(analyticsAbilities(access).employees).toBe(false);
    },
  );
  it("allows 366 days and rejects invalid, reversed and overlong dates", () => {
    expect(filterError("tasks", valid)).toBeNull();
    for (const patch of [
      { from: "2024-02-30" },
      { from: "2025-01-01" },
      { from: "2025-01-02" },
      { toExclusive: "2025-01-02" },
    ])
      expect(filterError("tasks", { ...valid, ...patch })).not.toBeNull();
  });
  it("requires 1–12 whole UTC months, independent of a 366-day cohort", () => {
    expect(filterError("monthly", valid)).toBeNull();
    expect(filterError("monthly", { ...valid, from: "2024-01-02" })).toMatch(
      /first-of-month/,
    );
    expect(
      filterError("monthly", { ...valid, toExclusive: "2025-02-01" }),
    ).toMatch(/1 to 12/);
  });
  it("validates IDs and bounded page sizes without applying dates to all-time views", () => {
    expect(
      filterError("events", { ...valid, from: "", toExclusive: "" }),
    ).toBeNull();
    expect(
      filterError("employees", { ...valid, subjectId: "injection" }),
    ).toMatch(/UUID/);
    expect(filterError("departments", { ...valid, pageSize: 101 })).toMatch(
      /100/,
    );
    expect(filterError("promotion", valid)).toMatch(/campaign ID/);
  });
});
