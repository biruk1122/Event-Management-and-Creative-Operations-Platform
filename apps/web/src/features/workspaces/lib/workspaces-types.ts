import type { components } from "@event-platform/api-client";

export type Workspace = components["schemas"]["WorkspaceResponse"];
export type PaginatedWorkspaces =
  components["schemas"]["PaginatedWorkspacesResponse"];
export type WorkspaceUserSummary =
  components["schemas"]["WorkspaceUserSummary"];
export type WorkspaceTeamSummary =
  components["schemas"]["WorkspaceTeamSummary"];

/**
 * Which module owns a workspace. Mirrors the API `kind` discriminator and the
 * required `kind` filter on `GET /workspaces`.
 */
export type WorkspaceKind = Workspace["kind"];

export const WORKSPACE_KINDS: readonly WorkspaceKind[] = [
  "EVENT",
  "PROJECT",
  "PRODUCTION",
  "CAMPAIGN",
];

export const WORKSPACE_KIND_LABELS: Record<WorkspaceKind, string> = {
  EVENT: "Event",
  PROJECT: "Project",
  PRODUCTION: "Production",
  CAMPAIGN: "Campaign",
};

/**
 * A user the manager and participant controls can offer. The workspace API has
 * no "assignable users" route, so WSP-05 sources this from `GET /users`; the
 * seam returns a small fixture set.
 */
export interface AssignableUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/**
 * A team the "assign team" control can offer. WSP-05 sources this from
 * `GET /teams`; the seam returns a small fixture set.
 */
export interface AssignableTeam {
  id: string;
  name: string;
}

/** The person's name, or their email when no name is on file. */
export function personName(
  person: Pick<AssignableUser, "firstName" | "lastName" | "email">,
): string {
  const parts = [person.firstName, person.lastName].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" ") : person.email;
}

/** The human label for a workspace kind. */
export function kindLabel(kind: WorkspaceKind): string {
  return WORKSPACE_KIND_LABELS[kind];
}
