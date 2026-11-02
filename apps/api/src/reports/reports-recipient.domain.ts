import type { PlatformRole } from "../common/security/department-access.policy.js";

/**
 * Pure rules for who a report is submitted to. Reports follow the reporting
 * chain Member -> Department Manager -> Admin -> Super Admin, but the
 * recipient is always an explicit, validated person - never "any Admin".
 *
 * - Department Member: their department's active manager.
 * - Department Manager: the Admin Super Admin designated for that department
 *   (`Department.reportingAdminId`). With no designation the submission is
 *   refused rather than guessing.
 * - Admin: a Super Admin. Auto-selected only when exactly one active Super
 *   Admin exists; with several, the author must choose explicitly.
 * - Super Admin (and accounts without a platform role) have nobody above
 *   them; their reports carry no recipient.
 */
export interface ReportRecipientContext {
  authorRole: PlatformRole | null;
  /** Active manager of the report's department, if any. */
  departmentManagerId: string | null;
  /** Active Admin Super Admin designated for the report's department. */
  reportingAdminId: string | null;
  activeSuperAdminIds: readonly string[];
}

export type ReportRecipientResolution =
  | { ok: true; reportToId: string | null }
  | {
      ok: false;
      reason: "not_designated" | "selection_required" | "ineligible";
    };

export function eligibleReportRecipients(
  context: ReportRecipientContext,
): string[] {
  switch (context.authorRole) {
    case "DEPARTMENT_MEMBER":
      return context.departmentManagerId ? [context.departmentManagerId] : [];
    case "DEPARTMENT_MANAGER":
      return context.reportingAdminId ? [context.reportingAdminId] : [];
    case "ADMIN":
      return [...context.activeSuperAdminIds];
    default:
      return [];
  }
}

export function resolveReportRecipient(
  context: ReportRecipientContext,
  explicitReportToId?: string | null,
): ReportRecipientResolution {
  if (context.authorRole === "SUPER_ADMIN" || context.authorRole === null) {
    return { ok: true, reportToId: null };
  }
  const eligible = eligibleReportRecipients(context);
  if (explicitReportToId) {
    return eligible.includes(explicitReportToId)
      ? { ok: true, reportToId: explicitReportToId }
      : { ok: false, reason: "ineligible" };
  }
  if (eligible.length === 0) return { ok: false, reason: "not_designated" };
  const [only] = eligible;
  if (eligible.length === 1 && only) return { ok: true, reportToId: only };
  return { ok: false, reason: "selection_required" };
}

/**
 * Review authority for a report. A report with a recipient is reviewed by that
 * recipient, or by Super Admin as final authority. A report without one
 * (created before per-report recipients) keeps the earlier Super-Admin-only
 * behavior, so Admin and Department Manager gain nothing over existing
 * records. The author-cannot-review rule is checked separately by the caller.
 */
export function canReviewReport(input: {
  actorId: string;
  actorRole: PlatformRole | null;
  reportToId: string | null;
}): boolean {
  if (input.actorRole === "SUPER_ADMIN") return true;
  return input.reportToId !== null && input.reportToId === input.actorId;
}
