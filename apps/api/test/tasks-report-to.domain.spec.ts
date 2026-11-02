import { describe, expect, it } from "vitest";

import type { PlatformRole } from "../src/common/security/department-access.policy.js";
import {
  canReviewTask,
  isEligibleExplicitRecipient,
  resolveInitialReportTo,
  type RecipientCandidate,
} from "../src/tasks/tasks-report-to.domain.js";

const candidate = (
  id: string,
  role: PlatformRole | null,
  departmentId: string | null = null,
  active = true,
): RecipientCandidate => ({ id, role, departmentId, active });

describe("resolveInitialReportTo - default recipient is the assigning user", () => {
  it.each<[string, PlatformRole]>([
    ["Super Admin -> anyone", "SUPER_ADMIN"],
    ["Admin -> Manager or Member", "ADMIN"],
    ["Department Manager -> own member", "DEPARTMENT_MANAGER"],
  ])("%s reports to the actor", (_label, actorRole) => {
    expect(
      resolveInitialReportTo({
        actorId: "actor",
        actorRole,
        candidate: null,
        taskDepartmentId: "d1",
      }),
    ).toEqual({ ok: true, reportToId: "actor", pinned: false });
  });
});

describe("resolveInitialReportTo - explicit recipient", () => {
  it("lets Super Admin pin an active Admin", () => {
    expect(
      resolveInitialReportTo({
        actorId: "sa",
        actorRole: "SUPER_ADMIN",
        explicitReportToId: "admin-1",
        candidate: candidate("admin-1", "ADMIN", "d9"),
        taskDepartmentId: "d1",
      }),
    ).toEqual({ ok: true, reportToId: "admin-1", pinned: true });
  });

  it("lets Super Admin pin another Super Admin (explicit choice with several)", () => {
    expect(
      resolveInitialReportTo({
        actorId: "sa",
        actorRole: "SUPER_ADMIN",
        explicitReportToId: "sa-2",
        candidate: candidate("sa-2", "SUPER_ADMIN"),
        taskDepartmentId: "d1",
      }),
    ).toEqual({ ok: true, reportToId: "sa-2", pinned: true });
  });

  it("lets Super Admin pin only the task department's own manager", () => {
    const base = {
      actorId: "sa",
      actorRole: "SUPER_ADMIN" as const,
      explicitReportToId: "dm",
      taskDepartmentId: "d1",
    };
    expect(
      resolveInitialReportTo({
        ...base,
        candidate: candidate("dm", "DEPARTMENT_MANAGER", "d1"),
      }),
    ).toMatchObject({ ok: true, reportToId: "dm" });
    expect(
      resolveInitialReportTo({
        ...base,
        candidate: candidate("dm", "DEPARTMENT_MANAGER", "other"),
      }),
    ).toEqual({ ok: false, reason: "ineligible" });
  });

  it.each([
    ["a member", candidate("u", "DEPARTMENT_MEMBER", "d1")],
    ["an inactive Admin", candidate("u", "ADMIN", "d1", false)],
    ["an unknown user", null],
    ["a custom-role user", candidate("u", null, "d1")],
  ])("rejects %s as a recipient", (_label, who) => {
    expect(
      resolveInitialReportTo({
        actorId: "sa",
        actorRole: "SUPER_ADMIN",
        explicitReportToId: "u",
        candidate: who,
        taskDepartmentId: "d1",
      }),
    ).toEqual({ ok: false, reason: "ineligible" });
  });

  it.each<PlatformRole | null>([
    "ADMIN",
    "DEPARTMENT_MANAGER",
    "DEPARTMENT_MEMBER",
    null,
  ])("refuses an explicit recipient from %s", (actorRole) => {
    expect(
      resolveInitialReportTo({
        actorId: "actor",
        actorRole,
        explicitReportToId: "admin-1",
        candidate: candidate("admin-1", "ADMIN"),
        taskDepartmentId: "d1",
      }),
    ).toEqual({ ok: false, reason: "not_allowed" });
  });
});

describe("isEligibleExplicitRecipient", () => {
  it("needs a task department before a manager can be chosen", () => {
    expect(
      isEligibleExplicitRecipient(
        candidate("dm", "DEPARTMENT_MANAGER", "d1"),
        null,
      ),
    ).toBe(false);
  });
});

describe("canReviewTask", () => {
  it("lets only the recipient or Super Admin review a task that has a recipient", () => {
    const base = { reportToId: "admin-1" };
    expect(
      canReviewTask({ ...base, actorId: "admin-1", actorRole: "ADMIN" }),
    ).toBe(true);
    expect(
      canReviewTask({ ...base, actorId: "sa", actorRole: "SUPER_ADMIN" }),
    ).toBe(true);
    // The Production manager keeps visibility but is not the recipient.
    expect(
      canReviewTask({
        ...base,
        actorId: "dm",
        actorRole: "DEPARTMENT_MANAGER",
      }),
    ).toBe(false);
    expect(
      canReviewTask({ ...base, actorId: "admin-2", actorRole: "ADMIN" }),
    ).toBe(false);
  });

  it("keeps the earlier behavior for tasks without a recipient, without widening it to Admin", () => {
    const legacy = { reportToId: null };
    expect(
      canReviewTask({ ...legacy, actorId: "sa", actorRole: "SUPER_ADMIN" }),
    ).toBe(true);
    expect(
      canReviewTask({
        ...legacy,
        actorId: "dm",
        actorRole: "DEPARTMENT_MANAGER",
      }),
    ).toBe(true);
    expect(
      canReviewTask({ ...legacy, actorId: "admin", actorRole: "ADMIN" }),
    ).toBe(false);
  });
});
