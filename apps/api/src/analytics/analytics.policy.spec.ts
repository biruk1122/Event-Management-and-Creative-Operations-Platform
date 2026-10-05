import { describe, expect, it } from "vitest";
import { PermissionScope } from "../generated/prisma/client.js";
import {
  analyticsPage,
  analyticsPeriod,
  analyticsScope,
} from "./analytics.policy.js";

describe("analytics policies", () => {
  const key = "analytics.management.read";
  it.each([PermissionScope.ORGANIZATION, PermissionScope.MANAGEMENT])(
    "accepts an exact %s measure grant",
    (scope) => {
      expect(analyticsScope([{ permissionKey: key, scope }], key)).toBe(
        "organization",
      );
    },
  );
  it.each([
    PermissionScope.SELF,
    PermissionScope.TEAM,
    PermissionScope.WORKSPACE,
    PermissionScope.DEPARTMENT,
  ])("does not promote %s to organization access", (scope) => {
    expect(() =>
      analyticsScope([{ permissionKey: key, scope }], key),
    ).toThrow();
  });
  it("does not inherit another measure, directory, dashboard or report grant", () => {
    for (const permissionKey of [
      "dashboard.read",
      "report.read",
      "analytics.department_performance.read",
      "user.read",
    ]) {
      expect(() =>
        analyticsScope(
          [{ permissionKey, scope: PermissionScope.ORGANIZATION }],
          key,
        ),
      ).toThrow();
    }
    expect(() => analyticsScope([], key)).toThrow();
  });
  it("permits department scope only when explicitly supported", () => {
    expect(
      analyticsScope(
        [{ permissionKey: key, scope: PermissionScope.DEPARTMENT }],
        key,
        true,
      ),
    ).toBe("department");
  });
  it("uses real UTC dates and accepts a leap-year cohort", () => {
    const period = analyticsPeriod(
      { from: "2024-01-01", toExclusive: "2025-01-01" },
      true,
    );
    expect(period.from.toISOString()).toBe("2024-01-01T00:00:00.000Z");
  });
  it.each([
    ["2026-02-30", "2026-03-01"],
    ["0000-01-01", "0000-02-01"],
    ["2026-01-01", "2026-01-01"],
    ["2026-02-01", "2026-01-01"],
    ["2026-01-01", "2027-01-03"],
    ["2026-1-01", "2026-02-01"],
    ["2026-01-01T00:00:00Z", "2026-02-01"],
  ])("rejects invalid cohort %s to %s", (from, toExclusive) => {
    expect(() => analyticsPeriod({ from, toExclusive })).toThrow();
  });
  it.each([
    ["2026-01-02", "2026-02-01"],
    ["2026-01-01", "2026-02-02"],
    ["2025-12-01", "2027-01-01"],
  ])(
    "rejects unbounded/partial calendar months %s to %s",
    (from, toExclusive) => {
      expect(() => analyticsPeriod({ from, toExclusive }, true)).toThrow();
    },
  );
  it("accepts the maximum page size and offset", () => {
    expect(analyticsPage({ page: 101, pageSize: 100 })).toEqual({
      page: 101,
      pageSize: 100,
    });
  });
  it.each([
    { page: 0, pageSize: 25 },
    { page: 1, pageSize: 101 },
    { page: 1, pageSize: 0 },
    { page: 102, pageSize: 100 },
    { page: 1.5, pageSize: 25 },
  ])("rejects invalid pagination %j", (page) => {
    expect(() => analyticsPage(page)).toThrow();
  });
});
