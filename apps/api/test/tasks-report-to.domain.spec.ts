import { describe, expect, it } from "vitest";

import type { PlatformRole } from "../src/common/security/department-access.policy.js";
import {
  canAssignRole,
  canCreateSubtaskUnder,
  canReviewTask,
  isEligibleExplicitRecipient,
  isEligibleReviewer,
  resolveDesignatedReviewer,
  resolveInitialReportTo,
  type RecipientCandidate,
  type ReviewerCandidate,
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

const reviewer = (
  id: string,
  overrides: Partial<ReviewerCandidate> = {},
): ReviewerCandidate => ({
  id,
  active: true,
  isAssignee: false,
  canReview: true,
  ...overrides,
});

describe("designated reviewer", () => {
  it("is the stored reviewer while eligible, regardless of role", () => {
    expect(
      resolveDesignatedReviewer({
        reportToId: "sa",
        reportTo: reviewer("sa"),
        creator: reviewer("other"),
      }),
    ).toEqual({ status: "resolved", reviewerId: "sa" });
  });

  it("resolves a legacy task with no recipient to an eligible creator", () => {
    expect(
      resolveDesignatedReviewer({
        reportToId: null,
        reportTo: null,
        creator: reviewer("creator"),
      }),
    ).toEqual({ status: "resolved", reviewerId: "creator" });
  });

  it("is unresolved when the stored reviewer became inactive or is now an assignee", () => {
    expect(
      resolveDesignatedReviewer({
        reportToId: "r",
        reportTo: reviewer("r", { active: false }),
        creator: null,
      }),
    ).toEqual({ status: "unresolved" });
    expect(
      resolveDesignatedReviewer({
        reportToId: "r",
        reportTo: reviewer("r", { isAssignee: true }),
        creator: null,
      }),
    ).toEqual({ status: "unresolved" });
  });

  it("is unresolved for a legacy task whose creator is missing, inactive or an assignee", () => {
    for (const creator of [
      null,
      reviewer("c", { active: false }),
      reviewer("c", { isAssignee: true }),
      reviewer("c", { canReview: false }),
    ]) {
      expect(
        resolveDesignatedReviewer({
          reportToId: null,
          reportTo: null,
          creator,
        }),
      ).toEqual({ status: "unresolved" });
    }
  });

  it("never falls back to Super Admin or Admin silently", () => {
    expect(
      resolveDesignatedReviewer({
        reportToId: null,
        reportTo: null,
        creator: null,
      }),
    ).toEqual({ status: "unresolved" });
  });

  it("applies one eligibility rule to every candidate", () => {
    expect(isEligibleReviewer(reviewer("a"))).toBe(true);
    expect(isEligibleReviewer(reviewer("a", { active: false }))).toBe(false);
    expect(isEligibleReviewer(reviewer("a", { isAssignee: true }))).toBe(false);
    expect(isEligibleReviewer(reviewer("a", { canReview: false }))).toBe(false);
    expect(isEligibleReviewer(null)).toBe(false);
  });
});

describe("canReviewTask", () => {
  it("lets only the designated reviewer approve, never Super Admin as such", () => {
    const designated = { status: "resolved" as const, reviewerId: "admin-1" };
    expect(canReviewTask({ actorId: "admin-1", designated })).toBe(true);
    expect(canReviewTask({ actorId: "sa", designated })).toBe(false);
    expect(canReviewTask({ actorId: "admin-2", designated })).toBe(false);
  });

  it("allows nobody when the reviewer is unresolved", () => {
    expect(
      canReviewTask({
        actorId: "sa",
        designated: { status: "unresolved" },
      }),
    ).toBe(false);
  });
});

describe("canAssignRole", () => {
  it("follows the chain Super Admin -> Admin -> Manager -> Member", () => {
    expect(canAssignRole("SUPER_ADMIN", "ADMIN")).toBe(true);
    expect(canAssignRole("SUPER_ADMIN", "DEPARTMENT_MANAGER")).toBe(true);
    expect(canAssignRole("SUPER_ADMIN", "DEPARTMENT_MEMBER")).toBe(true);
    expect(canAssignRole("SUPER_ADMIN", "SUPER_ADMIN")).toBe(false);
    expect(canAssignRole("ADMIN", "DEPARTMENT_MANAGER")).toBe(true);
    expect(canAssignRole("ADMIN", "DEPARTMENT_MEMBER")).toBe(true);
    expect(canAssignRole("ADMIN", "ADMIN")).toBe(false);
    expect(canAssignRole("ADMIN", "SUPER_ADMIN")).toBe(false);
    expect(canAssignRole("DEPARTMENT_MANAGER", "DEPARTMENT_MEMBER")).toBe(true);
    expect(canAssignRole("DEPARTMENT_MANAGER", "DEPARTMENT_MANAGER")).toBe(
      false,
    );
    expect(canAssignRole("DEPARTMENT_MANAGER", "ADMIN")).toBe(false);
    expect(canAssignRole("DEPARTMENT_MEMBER", "DEPARTMENT_MEMBER")).toBe(false);
    expect(canAssignRole(null, "DEPARTMENT_MEMBER")).toBe(false);
  });

  it("lets only Super Admin assign people who hold no platform role", () => {
    expect(canAssignRole("SUPER_ADMIN", null)).toBe(true);
    expect(canAssignRole("ADMIN", null)).toBe(false);
    expect(canAssignRole("DEPARTMENT_MANAGER", null)).toBe(false);
  });
});

describe("canCreateSubtaskUnder", () => {
  const base = {
    parentCreatedById: "creator",
    parentAssigneeIds: ["assignee"],
  };
  it("lets Super Admin create under any parent", () => {
    expect(
      canCreateSubtaskUnder({
        ...base,
        actorId: "sa",
        actorRole: "SUPER_ADMIN",
      }),
    ).toBe(true);
  });
  it("limits Admin and Manager to parents they created or are assigned to", () => {
    for (const actorRole of ["ADMIN", "DEPARTMENT_MANAGER"] as const) {
      expect(
        canCreateSubtaskUnder({ ...base, actorId: "creator", actorRole }),
      ).toBe(true);
      expect(
        canCreateSubtaskUnder({ ...base, actorId: "assignee", actorRole }),
      ).toBe(true);
      expect(
        canCreateSubtaskUnder({ ...base, actorId: "other", actorRole }),
      ).toBe(false);
    }
  });
  it("never lets a Department Member create subtasks", () => {
    expect(
      canCreateSubtaskUnder({
        ...base,
        actorId: "assignee",
        actorRole: "DEPARTMENT_MEMBER",
      }),
    ).toBe(false);
  });
});
