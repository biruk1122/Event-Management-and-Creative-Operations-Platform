import type { CurrentAccess } from "@/features/auth/api/access-queries";

export function hasProductionGrant(
  access: CurrentAccess,
  key: string,
  scope?: string,
): boolean {
  return access.grants.some(
    (grant) => grant.permissionKey === key && (!scope || grant.scope === scope),
  );
}

/** Department-scoped productions (PROD-WS): a Production Department Manager
 * holds these same `project.*` keys at `DEPARTMENT` scope, not just
 * `ORGANIZATION` - the server re-validates department ownership regardless
 * of what this reports. */
function canAny(access: CurrentAccess, key: string): boolean {
  return access.grants.some(
    (grant) =>
      grant.permissionKey === key &&
      (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
  );
}

function holdsOrg(access: CurrentAccess, key: string): boolean {
  return access.grants.some(
    (grant) => grant.permissionKey === key && grant.scope === "ORGANIZATION",
  );
}

export function productionAbilities(access: CurrentAccess) {
  return {
    canRead: canAny(access, "project.read"),
    canCreate: canAny(access, "project.create"),
    /** Whether the caller holds every department's production scope (Super
     * Admin), as opposed to only their own department's (a Production
     * Department Manager). */
    canCreateForAnyDepartment: holdsOrg(access, "project.create"),
    canUpdate: canAny(access, "project.update"),
    canTransition: canAny(access, "project.transition_status"),
    canAssign: canAny(access, "project.assign"),
    canDelete: canAny(access, "project.delete"),
    canReadBudget: canAny(access, "production.budget.read"),
    canUpdateBudget: canAny(access, "production.budget.update"),
    canListPeople: hasProductionGrant(access, "user.read", "ORGANIZATION"),
    canListTeams: canAny(access, "team.read"),
    canListTalent: hasProductionGrant(access, "talent.read", "ORGANIZATION"),
  };
}

export type ProductionArea =
  | "Overview"
  | "Schedule"
  | "Locations"
  | "Budget"
  | "Team"
  | "Talent"
  | "Calendar"
  | "Discussion"
  | "Meetings"
  | "Files"
  | "Reports";

const areaGrant: Record<ProductionArea, string | null> = {
  Overview: null,
  Schedule: "task.read",
  Locations: "project.read",
  Budget: "production.budget.read",
  Team: "team.read",
  Talent: "talent.read",
  Calendar: "calendar.read",
  Discussion: "channel.participate",
  Meetings: "meeting.read",
  Files: "file.read",
  Reports: "report.read",
};

const order: ProductionArea[] = [
  "Overview",
  "Schedule",
  "Locations",
  "Budget",
  "Team",
  "Talent",
  "Calendar",
  "Discussion",
  "Meetings",
  "Files",
  "Reports",
];

export function productionAreas(access: CurrentAccess): ProductionArea[] {
  return order.filter((area) => {
    const grant = areaGrant[area];
    return grant === null || hasProductionGrant(access, grant);
  });
}
