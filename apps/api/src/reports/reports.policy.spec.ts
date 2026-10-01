import { describe, expect, it } from "vitest";

import {
  parsePeriod,
  validateSections,
  validateSubmission,
} from "./reports.policy.js";

describe("report period and content policy", () => {
  it("accepts exact daily, seven-day weekly, and calendar-month periods", () => {
    expect(
      parsePeriod("DAILY", "2026-09-30", "2026-09-30").from.toISOString(),
    ).toBe("2026-09-30T00:00:00.000Z");
    expect(
      parsePeriod("WEEKLY", "2026-09-24", "2026-09-30").to.toISOString(),
    ).toBe("2026-09-30T00:00:00.000Z");
    expect(
      parsePeriod("MONTHLY", "2024-02-01", "2024-02-29").to.toISOString(),
    ).toBe("2024-02-29T00:00:00.000Z");
  });

  it("rejects invalid calendar dates and type-incompatible periods", () => {
    expect(() => parsePeriod("DAILY", "2026-02-30", "2026-02-30")).toThrow();
    expect(() => parsePeriod("WEEKLY", "2026-09-01", "2026-09-08")).toThrow();
    expect(() => parsePeriod("MONTHLY", "2026-09-02", "2026-09-30")).toThrow();
  });

  it("allows partial drafts but requires applicable sections at submission", () => {
    expect(() =>
      validateSections("DAILY", { nextDayPlan: "Tomorrow" }),
    ).not.toThrow();
    expect(() =>
      validateSubmission("DAILY", { nextDayPlan: "Tomorrow" }),
    ).toThrow();
    expect(() =>
      validateSubmission("DAILY", {
        nextDayPlan: "Tomorrow",
        problemsEncountered: "None",
      }),
    ).not.toThrow();
    expect(() =>
      validateSections("DAILY", { challenges: "Wrong type" }),
    ).toThrow();
    expect(() => validateSections("WEEKLY", { challenges: "   " })).toThrow();
  });

  it.each([
    ["DAILY", "2024-02-29", "2024-02-29"],
    ["WEEKLY", "2024-02-26", "2024-03-03"],
    ["MONTHLY", "2024-02-01", "2024-02-29"],
    ["MONTHLY", "2025-02-01", "2025-02-28"],
  ] as const)("accepts %s UTC period %s through %s", (type, start, end) => {
    expect(parsePeriod(type, start, end)).toEqual({
      from: new Date(`${start}T00:00:00.000Z`),
      to: new Date(`${end}T00:00:00.000Z`),
    });
  });

  it.each([
    ["DAILY", "2024-02-29", "2024-03-01"],
    ["WEEKLY", "2024-02-26", "2024-03-04"],
    ["MONTHLY", "2024-02-01", "2024-02-28"],
    ["MONTHLY", "2024-02-02", "2024-02-29"],
    ["DAILY", "2025-02-29", "2025-02-29"],
    ["DAILY", "2024-13-01", "2024-13-01"],
  ] as const)("rejects %s period %s through %s", (type, start, end) => {
    expect(() => parsePeriod(type, start, end)).toThrow();
  });

  it("requires the four weekly and monthly narrative sections without accepting cross-type fields", () => {
    expect(() =>
      validateSubmission("WEEKLY", {
        departmentActivities: "Production",
        majorAchievements: "Launch",
        challenges: "Rain",
        nextWeekPlan: "Rehearse",
      }),
    ).not.toThrow();
    expect(() =>
      validateSubmission("WEEKLY", {
        departmentActivities: "Production",
        majorAchievements: "Launch",
        challenges: "Rain",
      }),
    ).toThrow();
    expect(() =>
      validateSubmission("MONTHLY", {
        majorAchievements: "Launch",
        challenges: "Rain",
        departmentPerformance: "On plan",
        employeePerformance: "On plan",
      }),
    ).not.toThrow();
    expect(() =>
      validateSubmission("MONTHLY", {
        majorAchievements: "Launch",
        challenges: "Rain",
        departmentPerformance: "On plan",
      }),
    ).toThrow();
    expect(() =>
      validateSections("MONTHLY", { nextWeekPlan: "Wrong type" }),
    ).toThrow();
    expect(() =>
      validateSections("DAILY", { nextDayPlan: "x".repeat(5001) }),
    ).toThrow();
  });
});
