import type { Project, ProjectStatus } from "./projects-types";

/** The fields shared by the create and edit forms. */
export interface ProjectFieldValues {
  name: string;
  description: string;
  startAt: string;
  endAt: string;
  /** The event this project optionally relates to, or `null` for none. */
  eventId: string | null;
}

/** The fields the create form collects. */
export interface CreateProjectValues extends ProjectFieldValues {
  managerId: string | null;
}

/** The fields the edit-details form collects. Manager moves through its own control. */
export type EditProjectValues = ProjectFieldValues;

type FieldErrors<K extends string> = Partial<Record<K, string>>;

/**
 * Result of a create attempt, in UI terms. PRJ-05 maps the real
 * `POST /projects` Problem Details codes onto these cases; the form only
 * needs to know which state to present.
 */
export type SaveProjectOutcome =
  | { status: "success"; project: Project }
  | { status: "manager_not_found" }
  | { status: "event_not_found" }
  | { status: "schedule_invalid" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof CreateProjectValues>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type CreateProject = (
  values: CreateProjectValues,
) => Promise<SaveProjectOutcome>;

/** Result of `PATCH /projects/:id`. */
export type UpdateProjectOutcome =
  | { status: "success"; project: Project }
  | { status: "event_not_found" }
  | { status: "schedule_invalid" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof EditProjectValues>;
    }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type UpdateProject = (
  id: string,
  values: EditProjectValues,
) => Promise<UpdateProjectOutcome>;

/** Result of `POST /projects/:id/transition`. */
export type TransitionProjectOutcome =
  | { status: "success"; project: Project }
  | { status: "invalid_transition" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type TransitionProject = (
  id: string,
  status: ProjectStatus,
) => Promise<TransitionProjectOutcome>;

/** Result of `PUT /projects/:id/manager`. */
export type AssignProjectManagerOutcome =
  | { status: "success"; project: Project }
  | { status: "manager_not_found" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type AssignProjectManager = (
  id: string,
  managerId: string | null,
) => Promise<AssignProjectManagerOutcome>;

/** Result of `PUT` / `DELETE /projects/:id/teams/:teamId`. */
export type ProjectTeamOutcome =
  | { status: "success"; project: Project }
  | { status: "team_not_found" }
  | { status: "not_assigned" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type AssignProjectTeam = (
  id: string,
  teamId: string,
) => Promise<ProjectTeamOutcome>;

export type RemoveProjectTeam = (
  id: string,
  teamId: string,
) => Promise<ProjectTeamOutcome>;

/** Result of `DELETE /projects/:id`. */
export type DeleteProjectOutcome =
  | { status: "success" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type DeleteProject = (id: string) => Promise<DeleteProjectOutcome>;

/** Loads one project for the detail dialog; resolves `null` when it cannot. */
export type GetProject = (id: string) => Promise<Project | null>;
