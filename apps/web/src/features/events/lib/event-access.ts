import type { CurrentAccess } from "@/features/auth/api/access-queries";

/**
 * Event authorization mirrors `EventsService`: every route is a known
 * `kind = EVENT`, so it names the exact `event.*` key and checks it at
 * ORGANIZATION scope. A department-scoped `event.read` grant does not reach
 * this surface, matching WSP-02 / EVE-74.
 */
type Grant = CurrentAccess["grants"][number];

function holdsOrg(grants: readonly Grant[], key: string): boolean {
  return grants.some(
    (grant) => grant.permissionKey === key && grant.scope === "ORGANIZATION",
  );
}

/** Whether the caller may read events at all. */
export function canReadEvents(access: CurrentAccess): boolean {
  return holdsOrg(access.grants, "event.read");
}

export interface EventAbilities {
  canCreate: boolean;
  canUpdate: boolean;
  canTransition: boolean;
  canAssignManager: boolean;
  canAssignTeams: boolean;
  canReadBudget: boolean;
  canUpdateBudget: boolean;
  canDelete: boolean;
}

/** The caller's write abilities across the event surface, at organization scope. */
export function eventAbilities(access: CurrentAccess): EventAbilities {
  const can = (key: string) => holdsOrg(access.grants, key);
  return {
    canCreate: can("event.create"),
    canUpdate: can("event.update"),
    canTransition: can("event.transition_status"),
    canAssignManager: can("event.assign_manager"),
    canAssignTeams: can("event.assign_teams"),
    canReadBudget: can("event.budget.read"),
    canUpdateBudget: can("event.budget.update"),
    canDelete: can("event.delete"),
  };
}
