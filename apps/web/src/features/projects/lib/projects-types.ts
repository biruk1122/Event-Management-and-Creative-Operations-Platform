import type { components } from "@event-platform/api-client";

export type Project = components["schemas"]["ProjectResponse"];
export type PaginatedProjects =
  components["schemas"]["PaginatedProjectsResponse"];
export type ProjectPersonSummary =
  components["schemas"]["ProjectPersonSummary"];
export type ProjectTeamSummary = components["schemas"]["ProjectTeamSummary"];

/** The project lifecycle state. Mirrors the API `status` enum (SRS 9). */
export type ProjectStatus = Project["status"];

export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "PLANNED",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/**
 * The lifecycle moves the transition control offers from each state. Mirrors
 * the graph `ProjectsService` enforces (SRS 9): `COMPLETED` and `CANCELLED`
 * are terminal. Who may make each move, the entry criteria, and whether a
 * terminal project can be reopened are open in OD-03 and owned by the API.
 */
export const NEXT_STATUSES: Record<ProjectStatus, readonly ProjectStatus[]> = {
  PLANNED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

/**
 * A user the manager control can offer. The projects API has no "assignable
 * users" route, so PRJ-05 sources this from `GET /users`; the seam returns a
 * small fixture set.
 */
export interface AssignableUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/**
 * A team the "assign team" control can offer. PRJ-05 sources this from
 * `GET /teams`; the seam returns a small fixture set.
 */
export interface AssignableTeam {
  id: string;
  name: string;
}

/**
 * An event the "related event" control can offer. PRJ-05 sources this from
 * `GET /events`; the seam returns a small fixture set.
 */
export interface AssignableEvent {
  id: string;
  name: string;
}

/** The person's name, or their email when no name is on file. */
export function personName(
  person: Pick<ProjectPersonSummary, "firstName" | "lastName" | "email">,
): string {
  const parts = [person.firstName, person.lastName].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" ") : person.email;
}

/** The human label for a project lifecycle state. */
export function projectStatusLabel(status: ProjectStatus): string {
  return PROJECT_STATUS_LABELS[status];
}

/**
 * A short, human schedule summary for a row. Dates render in the viewer's
 * locale; a one-sided range shows the known end.
 */
export function scheduleSummary(
  project: Pick<Project, "startAt" | "endAt">,
): string {
  const fmt = (iso: string): string =>
    new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  if (project.startAt && project.endAt) {
    return `${fmt(project.startAt)} – ${fmt(project.endAt)}`;
  }
  if (project.startAt) return `From ${fmt(project.startAt)}`;
  if (project.endAt) return `Until ${fmt(project.endAt)}`;
  return "Not scheduled";
}
