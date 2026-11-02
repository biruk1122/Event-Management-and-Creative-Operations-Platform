import type { PlatformRole } from "../common/security/department-access.policy.js";

/**
 * Who receives a task's reports and decides its review is decided per task,
 * never inferred from the assignee's role. This module holds only the pure
 * rules so they can be unit-tested without a database.
 *
 * - The default recipient is the person who creates/assigns the task, which
 *   yields every row of the assignment table (Super Admin -> anyone: Super
 *   Admin; Admin -> anyone: Admin; Department Manager -> own member: that
 *   manager).
 * - Only Super Admin may explicitly name a different recipient, and only an
 *   active Super Admin, Admin, or the Department Manager of the task's own
 *   department is a valid target. Never an arbitrary employee.
 */
export interface RecipientCandidate {
  id: string;
  active: boolean;
  role: PlatformRole | null;
  departmentId: string | null;
}

export type ReportToResolution =
  | { ok: true; reportToId: string; pinned: boolean }
  | { ok: false; reason: "not_allowed" | "ineligible" };

export function isEligibleExplicitRecipient(
  candidate: RecipientCandidate | null,
  taskDepartmentId: string | null,
): boolean {
  if (!candidate || !candidate.active) return false;
  if (candidate.role === "SUPER_ADMIN" || candidate.role === "ADMIN") {
    return true;
  }
  return (
    candidate.role === "DEPARTMENT_MANAGER" &&
    taskDepartmentId !== null &&
    candidate.departmentId === taskDepartmentId
  );
}

export function resolveInitialReportTo(input: {
  actorId: string;
  actorRole: PlatformRole | null;
  explicitReportToId?: string | null | undefined;
  candidate: RecipientCandidate | null;
  taskDepartmentId: string | null;
}): ReportToResolution {
  if (!input.explicitReportToId) {
    return { ok: true, reportToId: input.actorId, pinned: false };
  }
  if (input.actorRole !== "SUPER_ADMIN") {
    return { ok: false, reason: "not_allowed" };
  }
  if (
    input.candidate?.id !== input.explicitReportToId ||
    !isEligibleExplicitRecipient(input.candidate, input.taskDepartmentId)
  ) {
    return { ok: false, reason: "ineligible" };
  }
  return { ok: true, reportToId: input.explicitReportToId, pinned: true };
}

/**
 * Whether the actor may approve or request changes on a task they can see.
 * Assignees can never review their own work (checked by the caller). A task
 * with a recipient is reviewed by that recipient, or by Super Admin as the
 * organization's final authority. A task without one (created before
 * per-task recipients) keeps the earlier behavior - any holder of
 * `task.review` in scope - except that the newer Admin role is not added to
 * that legacy set, so existing approval flows do not widen.
 */
export function canReviewTask(input: {
  actorId: string;
  actorRole: PlatformRole | null;
  reportToId: string | null;
}): boolean {
  if (input.reportToId) {
    return (
      input.reportToId === input.actorId || input.actorRole === "SUPER_ADMIN"
    );
  }
  return input.actorRole !== "ADMIN";
}
