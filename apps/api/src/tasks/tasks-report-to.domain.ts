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
 * A person considered as the designated reviewer of one task. Eligibility is
 * one rule everywhere (creator resolution, explicit choice, Super Admin
 * re-designation): active, not an assignee of the task, and holding
 * `task.review` for the task's department.
 */
export interface ReviewerCandidate {
  id: string;
  active: boolean;
  isAssignee: boolean;
  canReview: boolean;
}

export function isEligibleReviewer(
  candidate: ReviewerCandidate | null,
): boolean {
  return (
    candidate !== null &&
    candidate.active &&
    !candidate.isAssignee &&
    candidate.canReview
  );
}

export type DesignatedReviewer =
  { status: "resolved"; reviewerId: string } | { status: "unresolved" };

/**
 * The one reviewer a task answers to. A stored `reportToId` is authoritative
 * while that person stays eligible. A task with no stored recipient (created
 * before per-task recipients) resolves to its recorded creator only when the
 * creator is eligible. Anything else is unresolved: nobody may approve or
 * request changes until Super Admin designates a reviewer. Nothing falls back
 * to another person silently.
 */
export function resolveDesignatedReviewer(input: {
  reportTo: ReviewerCandidate | null;
  reportToId: string | null;
  creator: ReviewerCandidate | null;
}): DesignatedReviewer {
  if (input.reportToId) {
    return isEligibleReviewer(input.reportTo) &&
      input.reportTo?.id === input.reportToId
      ? { status: "resolved", reviewerId: input.reportToId }
      : { status: "unresolved" };
  }
  return isEligibleReviewer(input.creator) && input.creator?.id
    ? { status: "resolved", reviewerId: input.creator.id }
    : { status: "unresolved" };
}

/** Only the designated reviewer may approve or request changes. */
export function canReviewTask(input: {
  actorId: string;
  designated: DesignatedReviewer;
}): boolean {
  return (
    input.designated.status === "resolved" &&
    input.designated.reviewerId === input.actorId
  );
}

/**
 * Who a role may assign work to. Super Admin assigns Admins, Managers and
 * Members (never another Super Admin); Admin assigns Managers and Members;
 * a Department Manager assigns Members only (their own department is checked
 * separately). Department Members assign nobody.
 */
export function canAssignRole(
  actorRole: PlatformRole | null,
  candidateRole: PlatformRole | null,
): boolean {
  if (candidateRole === null || candidateRole === "SUPER_ADMIN") return false;
  switch (actorRole) {
    case "SUPER_ADMIN":
      return true;
    case "ADMIN":
      return (
        candidateRole === "DEPARTMENT_MANAGER" ||
        candidateRole === "DEPARTMENT_MEMBER"
      );
    case "DEPARTMENT_MANAGER":
      return candidateRole === "DEPARTMENT_MEMBER";
    default:
      return false;
  }
}

/**
 * Who may create a subtask under a parent. Super Admin: any parent. Admin and
 * Department Manager: only parents they created or are assigned to. Department
 * Members never create subtasks.
 */
export function canCreateSubtaskUnder(input: {
  actorId: string;
  actorRole: PlatformRole | null;
  parentCreatedById: string | null;
  parentAssigneeIds: readonly string[];
}): boolean {
  if (input.actorRole === "SUPER_ADMIN") return true;
  if (input.actorRole !== "ADMIN" && input.actorRole !== "DEPARTMENT_MANAGER") {
    return false;
  }
  return (
    input.parentCreatedById === input.actorId ||
    input.parentAssigneeIds.includes(input.actorId)
  );
}
