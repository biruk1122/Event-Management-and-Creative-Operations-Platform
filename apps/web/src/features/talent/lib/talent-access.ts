import type { CurrentAccess } from "@/features/auth/api/access-queries";

/**
 * Talent authorization mirrors `TalentService` and `TalentAccessService`.
 * Organization-wide `talent.*` grants (Super Admin and Admin) use the full
 * surface. A Production Manager - a Department Manager of the Production
 * department - may read the directory with contact details masked, and may
 * assign talent only to events and productions of their own department. The
 * server decides every one of those cases; these checks only shape the UI.
 */
type Grant = CurrentAccess["grants"][number];

/** Mirrors `apps/api/src/common/security/department-access.policy.ts`'s
 * `PRODUCTION_DEPARTMENT` constant. Duplicated as a literal because the web app
 * does not import from apps/api - keep both in sync if that name changes. */
const PRODUCTION_DEPARTMENT = "Production";

function holdsOrg(grants: readonly Grant[], key: string): boolean {
  return grants.some(
    (grant) => grant.permissionKey === key && grant.scope === "ORGANIZATION",
  );
}

/** Whether the caller is the Production department's active manager. */
export function isProductionManager(access: CurrentAccess): boolean {
  return (
    access.role === "DEPARTMENT_MANAGER" &&
    access.department?.active === true &&
    access.department.name === PRODUCTION_DEPARTMENT
  );
}

/** Whether the caller may open the talent directory at all. */
export function canReadTalent(access: CurrentAccess): boolean {
  return holdsOrg(access.grants, "talent.read") || isProductionManager(access);
}

export interface TalentAbilities {
  canCreate: boolean;
  /**
   * Editing profile fields, setting/clearing the manager, and managing social
   * links all share the single `talent.update` key.
   */
  canUpdate: boolean;
  canTransition: boolean;
  /**
   * Creating and changing assignments. For a Production Manager this is
   * limited to their own department's events and productions, which the
   * server enforces per work item.
   */
  canAssign: boolean;
  /** Adding, editing, and removing schedule entries. */
  canManageActivities: boolean;
  /** The caller sees the directory with contact details masked. */
  contactMasked: boolean;
}

/** The caller's abilities across the talent surface. */
export function talentAbilities(access: CurrentAccess): TalentAbilities {
  const can = (key: string) => holdsOrg(access.grants, key);
  const productionManager = isProductionManager(access);
  return {
    canCreate: can("talent.create"),
    canUpdate: can("talent.update"),
    canTransition: can("talent.transition_status"),
    canAssign: can("talent.assign") || productionManager,
    canManageActivities: can("talent.manage_activities"),
    contactMasked: !can("talent.read") && productionManager,
  };
}
