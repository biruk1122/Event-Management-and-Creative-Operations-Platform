import type { CurrentAccess } from "@/features/auth/api/access-queries";

/**
 * Campaign authorization mirrors `CampaignsService`: an organization-scoped
 * caller (Super Admin) reaches every `campaign.*` key; a department-scoped
 * caller (e.g. the Marketing Department Manager) reaches every key except
 * `campaign.delete`, which stays organization-only by design (no
 * `DEPARTMENT`-scope grant exists for it in the role catalog).
 */
type Grant = CurrentAccess["grants"][number];

function holdsAny(
  grants: readonly Grant[],
  key: string,
  scopes: readonly Grant["scope"][] = ["ORGANIZATION", "DEPARTMENT"],
): boolean {
  return grants.some(
    (grant) => grant.permissionKey === key && scopes.includes(grant.scope),
  );
}

/** Whether the caller may read campaigns at all. */
export function canReadCampaigns(access: CurrentAccess): boolean {
  return holdsAny(access.grants, "campaign.read");
}

export interface CampaignAbilities {
  canCreate: boolean;
  canUpdate: boolean;
  canTransition: boolean;
  /**
   * Manager and team assignment share a single `campaign.assign` key, so one
   * ability covers both connected-workspace controls.
   */
  canAssign: boolean;
  canReadBudget: boolean;
  canUpdateBudget: boolean;
  /** Creating, editing, changing the status of, and removing activities. */
  canManageActivities: boolean;
  canDelete: boolean;
}

/** The caller's abilities across the campaign surface. */
export function campaignAbilities(access: CurrentAccess): CampaignAbilities {
  const can = (key: string) => holdsAny(access.grants, key);
  return {
    canCreate: can("campaign.create"),
    canUpdate: can("campaign.update"),
    canTransition: can("campaign.transition_status"),
    canAssign: can("campaign.assign"),
    canReadBudget: can("campaign.budget.read"),
    canUpdateBudget: can("campaign.budget.update"),
    canManageActivities: can("campaign.activity.manage"),
    // Deleting a campaign stays organization-only - there is no
    // DEPARTMENT-scope grant for it in the role catalog.
    canDelete: holdsAny(access.grants, "campaign.delete", ["ORGANIZATION"]),
  };
}
