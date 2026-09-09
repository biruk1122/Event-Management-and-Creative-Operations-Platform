import type { components } from "@event-platform/api-client";

export type Event = components["schemas"]["EventResponse"];
export type PaginatedEvents = components["schemas"]["PaginatedEventsResponse"];
export type EventBudget = components["schemas"]["EventBudgetResponse"];
export type EventPersonSummary = components["schemas"]["EventPersonSummary"];
export type EventTeamSummary = components["schemas"]["EventTeamSummary"];

/** The classification of an event. Mirrors the API `eventType` enum (SRS 5.5). */
export type EventType = Event["eventType"];

/** The event lifecycle state. Mirrors the API `status` enum (SRS 5.5). */
export type EventStatus = Event["status"];

export const EVENT_TYPES: readonly EventType[] = [
  "FILM_PREMIERE",
  "CONCERT",
  "ALBUM_RELEASE",
  "PRODUCT_LAUNCH",
  "CORPORATE_EVENT",
  "PROMOTIONAL_EVENT",
  "OTHER",
];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  FILM_PREMIERE: "Film premiere",
  CONCERT: "Concert",
  ALBUM_RELEASE: "Album release",
  PRODUCT_LAUNCH: "Product launch",
  CORPORATE_EVENT: "Corporate event",
  PROMOTIONAL_EVENT: "Promotional event",
  OTHER: "Other event",
};

export const EVENT_STATUSES: readonly EventStatus[] = [
  "PLANNING",
  "READY",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  PLANNING: "Planning",
  READY: "Ready",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/**
 * The lifecycle moves the transition control offers from each state. Mirrors
 * the graph `EventsService` enforces (SRS 5.5): `COMPLETED` and `CANCELLED` are
 * terminal. Whether every event must pass through `READY`, and who may make a
 * move, are open in OD-05 and owned by the API.
 */
export const NEXT_STATUSES: Record<EventStatus, readonly EventStatus[]> = {
  PLANNING: ["READY", "IN_PROGRESS", "CANCELLED"],
  READY: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

/**
 * A user the manager control can offer. The events API has no "assignable
 * users" route, so EVT-05 sources this from `GET /users`; the seam returns a
 * small fixture set.
 */
export interface AssignableUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/**
 * A team the "assign team" control can offer. EVT-05 sources this from
 * `GET /teams`; the seam returns a small fixture set.
 */
export interface AssignableTeam {
  id: string;
  name: string;
}

/** The person's name, or their email when no name is on file. */
export function personName(
  person: Pick<EventPersonSummary, "firstName" | "lastName" | "email">,
): string {
  const parts = [person.firstName, person.lastName].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" ") : person.email;
}

/** The human label for an event type. */
export function eventTypeLabel(type: EventType): string {
  return EVENT_TYPE_LABELS[type];
}

/** The human label for an event lifecycle state. */
export function eventStatusLabel(status: EventStatus): string {
  return EVENT_STATUS_LABELS[status];
}

/**
 * A short, human schedule summary for a row. Dates render in the viewer's
 * locale; a one-sided range shows the known end. EVT-05 may refine the
 * timezone presentation (OD-15).
 */
export function scheduleSummary(
  event: Pick<Event, "startAt" | "endAt">,
): string {
  const fmt = (iso: string): string =>
    new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  if (event.startAt && event.endAt) {
    return `${fmt(event.startAt)} – ${fmt(event.endAt)}`;
  }
  if (event.startAt) return `From ${fmt(event.startAt)}`;
  if (event.endAt) return `Until ${fmt(event.endAt)}`;
  return "Not scheduled";
}

/** Formats a budget for display, or a dash when none is set. */
export function budgetSummary(budget: EventBudget | null): string {
  if (!budget || budget.amount === null || budget.currency === null) {
    return "—";
  }
  return `${budget.amount} ${budget.currency}`;
}
