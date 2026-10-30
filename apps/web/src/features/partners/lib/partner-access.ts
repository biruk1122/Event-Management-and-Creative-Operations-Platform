import type { CurrentAccess } from "@/features/auth/api/access-queries";

/**
 * Partner authorization mirrors `PartnersService`: the backend resolves
 * scope server-side - an organization-scoped caller (Super Admin) sees every
 * partner, a department-scoped caller (the Marketing Manager) sees their own
 * department's, and a self-scoped caller (a Team Member) sees only the
 * relationships they own. The client only uses this to decide what to show;
 * every request is re-validated by the server regardless.
 */
type Grant = CurrentAccess["grants"][number];

function holds(
  grants: readonly Grant[],
  key: string,
  scopes: readonly Grant["scope"][] = ["ORGANIZATION", "DEPARTMENT", "SELF"],
): boolean {
  return grants.some(
    (grant) => grant.permissionKey === key && scopes.includes(grant.scope),
  );
}

export function canReadPartners(access: CurrentAccess): boolean {
  return holds(access.grants, "partner.read");
}

export interface PartnerAbilities {
  canCreate: boolean;
  canUpdate: boolean;
  canAddActivity: boolean;
  /** Only an organization- or department-scoped caller may browse the full
   * directory; a self-scoped caller only ever sees their own relationships,
   * so filters like status/search apply but ownership filtering does not. */
  isDirectoryView: boolean;
}

export function partnerAbilities(access: CurrentAccess): PartnerAbilities {
  return {
    canCreate: holds(access.grants, "partner.create", [
      "ORGANIZATION",
      "DEPARTMENT",
    ]),
    canUpdate: holds(access.grants, "partner.update", [
      "ORGANIZATION",
      "DEPARTMENT",
    ]),
    canAddActivity: holds(access.grants, "partner.activity.create"),
    isDirectoryView: holds(access.grants, "partner.read", [
      "ORGANIZATION",
      "DEPARTMENT",
    ]),
  };
}
