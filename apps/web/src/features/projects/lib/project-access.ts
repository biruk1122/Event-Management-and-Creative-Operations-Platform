import type { CurrentAccess } from "@/features/auth/api/access-queries";

/**
 * Project authorization mirrors `ProjectsService`: every route is a known
 * `kind = PROJECT`, so it names the exact `project.*` key and checks it at
 * ORGANIZATION scope. A department-scoped `project.read` grant does not
 * reach this surface, matching WSP-02.
 */
type Grant = CurrentAccess["grants"][number];

function holdsOrg(grants: readonly Grant[], key: string): boolean {
  return grants.some(
    (grant) => grant.permissionKey === key && grant.scope === "ORGANIZATION",
  );
}

/** Whether the caller may read projects at all. */
export function canReadProjects(access: CurrentAccess): boolean {
  return holdsOrg(access.grants, "project.read");
}

export interface ProjectAbilities {
  canCreate: boolean;
  canUpdate: boolean;
  canTransition: boolean;
  /**
   * Manager and team assignment share a single `project.assign` key (unlike
   * events, which split them into `event.assign_manager`/`event.assign_teams`),
   * so there is one ability covering both connected-workspace controls.
   */
  canAssign: boolean;
  canDelete: boolean;
}

/** The caller's write abilities across the project surface, at organization scope. */
export function projectAbilities(access: CurrentAccess): ProjectAbilities {
  const can = (key: string) => holdsOrg(access.grants, key);
  return {
    canCreate: can("project.create"),
    canUpdate: can("project.update"),
    canTransition: can("project.transition_status"),
    canAssign: can("project.assign"),
    canDelete: can("project.delete"),
  };
}
