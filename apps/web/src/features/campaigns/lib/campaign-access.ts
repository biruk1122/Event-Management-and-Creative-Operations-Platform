import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { isOverseenRecord } from "@/features/auth/lib/department-oversight";

import {
  nextCampaignStatuses,
  type Campaign,
  type CampaignStatus,
} from "./campaigns-types";

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

/**
 * The caller's abilities on one campaign. A campaign of a department the
 * caller only oversees (EVE-229) is read-only: the API refuses every write, so
 * none is offered. The budget stays readable, as the API allows.
 */
export function campaignAbilitiesFor(
  access: CurrentAccess,
  campaign: Pick<Campaign, "departmentId">,
  base: CampaignAbilities = campaignAbilities(access),
): CampaignAbilities {
  if (!isOverseenRecord(access, campaign.departmentId)) return base;
  return readOnlyCampaignAbilities(base);
}

/** Every write off; reading the budget stays as granted. */
export function readOnlyCampaignAbilities(
  base: CampaignAbilities,
): CampaignAbilities {
  return {
    canCreate: false,
    canUpdate: false,
    canTransition: false,
    canAssign: false,
    canReadBudget: base.canReadBudget,
    canUpdateBudget: false,
    canManageActivities: false,
    canDelete: false,
  };
}

/**
 * The lifecycle moves offered to this caller, mirroring `CampaignsService`:
 * approving a promotion campaign is for Super Admin and Admin only, and Admin
 * may only approve.
 */
export function campaignMovesFor(
  access: CurrentAccess,
  campaign: Pick<Campaign, "campaignType" | "status">,
): CampaignStatus[] {
  return nextCampaignStatuses(campaign).filter((target) => {
    const approval =
      campaign.campaignType === "PROMOTION" &&
      campaign.status === "PLANNED" &&
      target === "APPROVED";
    if (access.role === "ADMIN") return approval;
    return !approval || access.role === "SUPER_ADMIN";
  });
}
