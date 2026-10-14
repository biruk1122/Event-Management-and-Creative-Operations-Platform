import type { CurrentAccess } from "@/features/auth/api/access-queries";

/**
 * Event authorization mirrors `EventsService`: every route names the exact
 * `event.*` key, and the backend resolves scope server-side - organization
 * scope sees every event, department scope (the Event & Office Manager, or
 * any department manager) sees only their own department's events (EOM-01).
 * This check only needs to know the caller holds the key at *some* scope the
 * backend accepts; which events that scope actually returns is resolved by
 * the API, never guessed here.
 */
type Grant = CurrentAccess["grants"][number];

function holdsAny(grants: readonly Grant[], key: string): boolean {
  return grants.some(
    (grant) =>
      grant.permissionKey === key &&
      (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
  );
}

/** Whether the caller may read events at all. */
export function canReadEvents(access: CurrentAccess): boolean {
  return holdsAny(access.grants, "event.read");
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

/** The caller's write abilities across the event surface (organization or
 * department scope - see the module doc comment). */
export function eventAbilities(access: CurrentAccess): EventAbilities {
  const can = (key: string) => holdsAny(access.grants, key);
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
