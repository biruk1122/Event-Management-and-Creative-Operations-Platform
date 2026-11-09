import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { isOverseenRecord } from "@/features/auth/lib/department-oversight";

import type { Task, TaskStatus } from "./tasks-types";

/**
 * Task authorization mirrors `TasksService`: the backend resolves scope
 * server-side - organization scope (Super Admin) can create and assign a
 * task for any department, department scope (Department Manager) only for
 * their own. The UI never trusts a client-held department id for anything
 * but pre-filling a field; every create/assign request is re-validated by
 * the server regardless of what this helper reports.
 */
type Grant = CurrentAccess["grants"][number];

function holdsAny(grants: readonly Grant[], key: string): boolean {
  return grants.some(
    (grant) =>
      grant.permissionKey === key &&
      (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
  );
}

function holdsOrg(grants: readonly Grant[], key: string): boolean {
  return grants.some(
    (grant) => grant.permissionKey === key && grant.scope === "ORGANIZATION",
  );
}

/** Whether the caller may read tasks at all. */
export function canReadTasks(access: CurrentAccess): boolean {
  return holdsAny(access.grants, "task.read");
}

/** Whether the caller can create a task - Super Admin or Department Manager. */
export function canCreateTasks(access: CurrentAccess): boolean {
  return holdsAny(access.grants, "task.create");
}

/** Whether the caller holds every department's task scope (Super Admin), as
 * opposed to only their own department's (Department Manager). */
export function canCreateTasksForAnyDepartment(access: CurrentAccess): boolean {
  return holdsOrg(access.grants, "task.create");
}

export function hasGrant(access: CurrentAccess, permissionKey: string) {
  return access.grants.some((grant) => grant.permissionKey === permissionKey);
}

/** True for a grant held at any scope other than SELF (ORGANIZATION or
 * DEPARTMENT today) - those scopes authorize acting on any task in reach
 * regardless of assignment. SELF scope, in contrast, means "I am this
 * task's assignee" (see [[task-management-redesign]]'s assignee-only
 * self-report fix) and must be checked per task. */
export function hasBroadGrant(access: CurrentAccess, permissionKey: string) {
  return access.grants.some(
    (grant) => grant.permissionKey === permissionKey && grant.scope !== "SELF",
  );
}

export function hasSelfGrant(access: CurrentAccess, permissionKey: string) {
  return access.grants.some(
    (grant) => grant.permissionKey === permissionKey && grant.scope === "SELF",
  );
}

/** True only for an organization-scoped grant (Super Admin) - the mirror
 * of the backend's `actorIsOrganizationScoped` check, used for the
 * legacy-checklist-item fallback (an item with no recorded creator is
 * only manageable by an organization-scoped actor, never a
 * department-scoped Manager by default). */
export function hasOrganizationGrant(
  access: CurrentAccess,
  permissionKey: string,
) {
  return access.grants.some(
    (grant) =>
      grant.permissionKey === permissionKey && grant.scope === "ORGANIZATION",
  );
}

/**
 * A task of a department the viewer only oversees (EVE-229): visible, never
 * changeable. Every per-task predicate below refuses it, and the task screens
 * hide their blanket controls (comment, upload, assign) for it.
 */
export function isReadOnlyTask(access: CurrentAccess, task: Task): boolean {
  return isOverseenRecord(access, task.departmentId);
}

export function isAssignee(task: Task, userId: string): boolean {
  return task.assignees.some((assignee) => assignee.id === userId);
}

export function isCreator(task: Task, userId: string): boolean {
  return task.createdBy?.id === userId;
}

/** Builds a per-task "may act on this task, but only as its own creator"
 * predicate for a given permission key: an organization-scoped actor
 * (Super Admin) always can; a narrower-scoped actor (Department Manager)
 * only when they are this task's own creator - a Manager who is merely
 * the assignee of a task someone else created (typically Super Admin)
 * never qualifies, regardless of holding the permission at DEPARTMENT
 * scope. Shared by assignee management, checklist add/remove, and review
 * decisions - all three are creator-only actions for a non-organization
 * -scoped actor. */
export function creatorGatedFor(access: CurrentAccess, permissionKey: string) {
  const organizationScoped = hasOrganizationGrant(access, permissionKey);
  const grantedAtAll = hasGrant(access, permissionKey);
  return (task: Task) =>
    !isReadOnlyTask(access, task) &&
    (organizationScoped || (grantedAtAll && isCreator(task, access.userId)));
}

/**
 * Per-task review authority. A task with a reporting recipient is reviewed by
 * that recipient (or Super Admin) - not by anyone who merely holds
 * `task.review` in scope, so a Department Manager no longer sees a review
 * panel on work that reports to Admin. Tasks from before per-task recipients
 * keep the earlier creator/organization rule, which never included Admin.
 * An assignee can never review their own work.
 */
/**
 * Only the task's designated reviewer may approve or request changes - Super
 * Admin included. The designated reviewer is the stored reporting recipient,
 * or, for older tasks without one, the recorded creator. The server makes the
 * final call; this only decides whether the review panel is offered.
 */
export function canReviewFor(access: CurrentAccess) {
  return (task: Task) => {
    if (isReadOnlyTask(access, task)) return false;
    if (!hasGrant(access, "task.review")) return false;
    if (isAssignee(task, access.userId)) return false;
    const designated = task.reportTo?.id ?? task.createdBy?.id ?? null;
    return designated === access.userId;
  };
}

/** Per-task "may manage this task's own assignee list" predicate - a
 * Manager who is merely the assignee of a task someone else created
 * manages assignment only by creating subtasks, not by editing who else
 * works on a task assigned to them. */
export function canManageAssigneesFor(access: CurrentAccess) {
  return creatorGatedFor(access, "task.assign");
}

/** Builds a per-task predicate for an assignee-only self-report action:
 * true if the actor holds the grant broadly (org/department), or holds it
 * at SELF scope and is specifically this task's assignee - never merely
 * its creator. */
export function canActOnAssignedTask(
  access: CurrentAccess,
  permissionKey: string,
) {
  const broad = hasBroadGrant(access, permissionKey);
  const self = hasSelfGrant(access, permissionKey);
  return (task: Task) =>
    !isReadOnlyTask(access, task) &&
    (broad || (self && isAssignee(task, access.userId)));
}

export interface TaskListFilters {
  search: string;
  status: TaskStatus | null;
  assignedToMe: boolean;
  createdByMe: boolean;
  /** "Reporting to me": tasks whose reporting recipient is the viewer. */
  reportingToMe: boolean;
  overdueOnly: boolean;
  /** Only tasks with no eligible designated reviewer. */
  reviewerNeeded: boolean;
  departmentId: string | null;
}

/** Owns API state so the workspace stays a rendering and interaction surface. */
