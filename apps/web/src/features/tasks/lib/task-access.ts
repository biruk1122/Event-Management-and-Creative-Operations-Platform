import type { CurrentAccess } from "@/features/auth/api/access-queries";

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
