import type { CurrentAccess } from "@/features/auth/api/access-queries";

/**
 * Talent authorization mirrors `TalentService`: every route names the exact
 * `talent.*` key and checks it at ORGANIZATION scope. A department-scoped
 * `talent.read` grant does not reach this surface. `Management/Administrator`
 * carries no `talent.*` grants at all - only the dedicated `Talent Manager`
 * role (and Super Admin) can use this area.
 */
type Grant = CurrentAccess["grants"][number];

function holdsOrg(grants: readonly Grant[], key: string): boolean {
  return grants.some(
    (grant) => grant.permissionKey === key && grant.scope === "ORGANIZATION",
  );
}

/** Whether the caller may read talent profiles at all. */
export function canReadTalent(access: CurrentAccess): boolean {
  return holdsOrg(access.grants, "talent.read");
}

export interface TalentAbilities {
  canCreate: boolean;
  /**
   * Editing profile fields, setting/clearing the manager, and managing social
   * links all share the single `talent.update` key.
   */
  canUpdate: boolean;
  canTransition: boolean;
  /** Creating and transitioning event assignments. */
  canAssign: boolean;
  /** Adding, editing, and removing schedule entries. */
  canManageActivities: boolean;
}

/** The caller's abilities across the talent surface, at organization scope. */
export function talentAbilities(access: CurrentAccess): TalentAbilities {
  const can = (key: string) => holdsOrg(access.grants, key);
  return {
    canCreate: can("talent.create"),
    canUpdate: can("talent.update"),
    canTransition: can("talent.transition_status"),
    canAssign: can("talent.assign"),
    canManageActivities: can("talent.manage_activities"),
  };
}
