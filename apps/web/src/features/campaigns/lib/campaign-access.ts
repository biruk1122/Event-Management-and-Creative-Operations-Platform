import type { CurrentAccess } from "@/features/auth/api/access-queries";

/**
 * Campaign authorization mirrors `CampaignsService`: every route is a known
 * `kind = CAMPAIGN`, so it names the exact `campaign.*` key and checks it at
 * ORGANIZATION scope. A department-scoped `campaign.read` grant does not reach
 * this surface, matching WSP-02.
 */
type Grant = CurrentAccess["grants"][number];

function holdsOrg(grants: readonly Grant[], key: string): boolean {
  return grants.some(
    (grant) => grant.permissionKey === key && grant.scope === "ORGANIZATION",
  );
}

/** Whether the caller may read campaigns at all. */
export function canReadCampaigns(access: CurrentAccess): boolean {
  return holdsOrg(access.grants, "campaign.read");
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

/** The caller's abilities across the campaign surface, at organization scope. */
export function campaignAbilities(access: CurrentAccess): CampaignAbilities {
  const can = (key: string) => holdsOrg(access.grants, key);
  return {
    canCreate: can("campaign.create"),
    canUpdate: can("campaign.update"),
    canTransition: can("campaign.transition_status"),
    canAssign: can("campaign.assign"),
    canReadBudget: can("campaign.budget.read"),
    canUpdateBudget: can("campaign.budget.update"),
    canManageActivities: can("campaign.activity.manage"),
    canDelete: can("campaign.delete"),
  };
}
