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

export function productionAbilities(access: CurrentAccess) {
  const can = (key: string) => hasProductionGrant(access, key, "ORGANIZATION");
  return {
    canRead: can("project.read"),
    canCreate: can("project.create"),
    canUpdate: can("project.update"),
    canTransition: can("project.transition_status"),
    canAssign: can("project.assign"),
    canDelete: can("project.delete"),
    canListPeople: can("user.read"),
    canListTeams: can("team.read"),
    canListTalent: can("talent.read"),
  };
}

export type ProductionArea =
  | "Overview"
  | "Team"
  | "Talent"
  | "Tasks"
  | "Calendar"
  | "Discussion"
  | "Meetings"
  | "Files"
  | "Reports";

const areaGrant: Record<ProductionArea, string | null> = {
  Overview: null,
  Team: "team.read",
  Talent: "talent.read",
  Tasks: "task.read",
  Calendar: "calendar.read",
  Discussion: "channel.participate",
  Meetings: "meeting.read",
  Files: "file.read",
  Reports: "report.read",
};

const order: ProductionArea[] = [
  "Overview",
  "Team",
  "Talent",
  "Tasks",
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
