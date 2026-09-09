import type {
  Event,
  EventBudget,
  EventStatus,
  EventType,
} from "./events-types";

/** The fields the create form collects. Optional text fields are empty strings. */
export interface CreateEventValues {
  name: string;
  eventType: EventType;
  description: string;
  startAt: string;
  endAt: string;
  location: string;
  organizerName: string;
  managerId: string | null;
}

/** The fields the edit-details form collects. */
export interface EditEventValues {
  name: string;
  eventType: EventType;
  description: string;
  startAt: string;
  endAt: string;
  location: string;
  organizerName: string;
}

type FieldErrors<K extends string> = Partial<Record<K, string>>;

/**
 * Result of a create attempt, in UI terms. EVT-05 maps the real
 * `POST /events` Problem Details codes onto these cases; the form only needs to
 * know which state to present.
 */
export type SaveEventOutcome =
  | { status: "success"; event: Event }
  | { status: "manager_not_found" }
  | { status: "schedule_invalid" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof CreateEventValues>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type CreateEvent = (
  values: CreateEventValues,
) => Promise<SaveEventOutcome>;

/** Result of `PATCH /events/:id`. */
export type UpdateEventOutcome =
  | { status: "success"; event: Event }
  | { status: "schedule_invalid" }
  | { status: "field_errors"; fieldErrors: FieldErrors<keyof EditEventValues> }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type UpdateEvent = (
  id: string,
  values: EditEventValues,
) => Promise<UpdateEventOutcome>;

/** Result of `POST /events/:id/transition`. */
export type TransitionEventOutcome =
  | { status: "success"; event: Event }
  | { status: "invalid_transition" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type TransitionEvent = (
  id: string,
  status: EventStatus,
) => Promise<TransitionEventOutcome>;

/** Result of `PUT /events/:id/manager`. */
export type AssignEventManagerOutcome =
  | { status: "success"; event: Event }
  | { status: "manager_not_found" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type AssignEventManager = (
  id: string,
  managerId: string | null,
) => Promise<AssignEventManagerOutcome>;

/** Result of `PUT` / `DELETE /events/:id/teams/:teamId`. */
export type EventTeamOutcome =
  | { status: "success"; event: Event }
  | { status: "team_not_found" }
  | { status: "not_assigned" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type AssignEventTeam = (
  id: string,
  teamId: string,
) => Promise<EventTeamOutcome>;

export type RemoveEventTeam = (
  id: string,
  teamId: string,
) => Promise<EventTeamOutcome>;

/** Result of `PUT /events/:id/budget`. `denied` covers a missing budget key. */
export type SetEventBudgetOutcome =
  | { status: "success"; budget: EventBudget }
  | { status: "budget_incomplete" }
  | {
      status: "field_errors";
      fieldErrors: { amount?: string; currency?: string };
    }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type SetEventBudget = (
  id: string,
  amount: number | null,
  currency: string | null,
) => Promise<SetEventBudgetOutcome>;

/** Result of `DELETE /events/:id`. */
export type DeleteEventOutcome =
  | { status: "success" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type DeleteEvent = (id: string) => Promise<DeleteEventOutcome>;

/** Loads one event for the detail dialog; resolves `null` when it cannot. */
export type GetEvent = (id: string) => Promise<Event | null>;

/**
 * Loads the budget for one event. Resolves `null` when the caller may not read
 * it (EVT-05 maps a 403 here) so the section can render a "restricted" state.
 */
export type GetEventBudget = (id: string) => Promise<EventBudget | null>;
