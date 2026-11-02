import { describe, expect, it } from "vitest";

import {
  canReviewReport,
  eligibleReportRecipients,
  resolveReportRecipient,
  type ReportRecipientContext,
} from "../src/reports/reports-recipient.domain.js";

const context = (
  overrides: Partial<ReportRecipientContext>,
): ReportRecipientContext => ({
  authorRole: "DEPARTMENT_MEMBER",
  departmentManagerId: "dm-1",
  reportingAdminId: "admin-1",
  activeSuperAdminIds: ["sa-1"],
  ...overrides,
});

describe("resolveReportRecipient", () => {
  it("sends a member's report to their department manager", () => {
    expect(resolveReportRecipient(context({}))).toEqual({
      ok: true,
      reportToId: "dm-1",
    });
  });

  it("sends a manager's departmental report to the designated reporting Admin", () => {
    expect(
      resolveReportRecipient(context({ authorRole: "DEPARTMENT_MANAGER" })),
    ).toEqual({ ok: true, reportToId: "admin-1" });
  });

  it("refuses to guess when no reporting Admin is designated", () => {
    expect(
      resolveReportRecipient(
        context({ authorRole: "DEPARTMENT_MANAGER", reportingAdminId: null }),
      ),
    ).toEqual({ ok: false, reason: "not_designated" });
  });

  it("refuses a member's report when the department has no manager", () => {
    expect(
      resolveReportRecipient(context({ departmentManagerId: null })),
    ).toEqual({ ok: false, reason: "not_designated" });
  });

  it("sends an Admin's consolidated report to the only Super Admin", () => {
    expect(resolveReportRecipient(context({ authorRole: "ADMIN" }))).toEqual({
      ok: true,
      reportToId: "sa-1",
    });
  });

  it("requires an explicit choice when several Super Admins exist", () => {
    const several = context({
      authorRole: "ADMIN",
      activeSuperAdminIds: ["sa-1", "sa-2"],
    });
    expect(resolveReportRecipient(several)).toEqual({
      ok: false,
      reason: "selection_required",
    });
    expect(resolveReportRecipient(several, "sa-2")).toEqual({
      ok: true,
      reportToId: "sa-2",
    });
  });

  it("never lets a report go to an arbitrary Admin or user", () => {
    expect(
      resolveReportRecipient(
        context({ authorRole: "DEPARTMENT_MANAGER" }),
        "some-other-admin",
      ),
    ).toEqual({ ok: false, reason: "ineligible" });
    expect(
      resolveReportRecipient(context({ authorRole: "ADMIN" }), "admin-2"),
    ).toEqual({ ok: false, reason: "ineligible" });
  });

  it("gives Super Admin (and role-less accounts) no recipient", () => {
    expect(
      resolveReportRecipient(context({ authorRole: "SUPER_ADMIN" })),
    ).toEqual({ ok: true, reportToId: null });
    expect(resolveReportRecipient(context({ authorRole: null }))).toEqual({
      ok: true,
      reportToId: null,
    });
  });

  it("exposes the eligible set for the picker", () => {
    expect(eligibleReportRecipients(context({ authorRole: "ADMIN" }))).toEqual([
      "sa-1",
    ]);
  });
});

describe("canReviewReport", () => {
  it("lets only the recipient or Super Admin review", () => {
    expect(
      canReviewReport({
        actorId: "dm-1",
        actorRole: "DEPARTMENT_MANAGER",
        reportToId: "dm-1",
      }),
    ).toBe(true);
    expect(
      canReviewReport({
        actorId: "admin-1",
        actorRole: "ADMIN",
        reportToId: "dm-1",
      }),
    ).toBe(false);
    expect(
      canReviewReport({
        actorId: "sa",
        actorRole: "SUPER_ADMIN",
        reportToId: "dm-1",
      }),
    ).toBe(true);
  });

  it("keeps reports without a recipient Super-Admin-only", () => {
    const legacy = { reportToId: null };
    expect(
      canReviewReport({ ...legacy, actorId: "sa", actorRole: "SUPER_ADMIN" }),
    ).toBe(true);
    expect(
      canReviewReport({
        ...legacy,
        actorId: "dm",
        actorRole: "DEPARTMENT_MANAGER",
      }),
    ).toBe(false);
    expect(
      canReviewReport({ ...legacy, actorId: "a", actorRole: "ADMIN" }),
    ).toBe(false);
  });
});
