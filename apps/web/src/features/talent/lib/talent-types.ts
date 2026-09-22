import type { components } from "@event-platform/api-client";

export type Talent = components["schemas"]["TalentResponse"];
export type PaginatedTalents =
  components["schemas"]["PaginatedTalentsResponse"];
export type TalentSchedule = components["schemas"]["TalentScheduleResponse"];
export type TalentSocialLink =
  components["schemas"]["TalentSocialLinkResponse"];
export type TalentEventAssignment =
  components["schemas"]["TalentEventAssignmentResponse"];
export type TalentPersonSummary = components["schemas"]["TalentUserSummary"];

/** The talent's discipline. Mirrors the API `type` enum. */
export type TalentType = Talent["type"];

/** The talent's availability state. Mirrors the API `availability` enum. */
export type TalentAvailability = Talent["availability"];

/** The state of one event assignment. Mirrors the API assignment `status` enum. */
export type TalentAssignmentStatus = TalentEventAssignment["status"];

export const TALENT_TYPES: readonly TalentType[] = [
  "ARTIST",
  "INFLUENCER",
  "ACTOR",
  "MUSICIAN",
  "MODEL",
  "PRESENTER",
  "CONTENT_CREATOR",
];

export const TALENT_TYPE_LABELS: Record<TalentType, string> = {
  ARTIST: "Artist",
  INFLUENCER: "Influencer",
  ACTOR: "Actor",
  MUSICIAN: "Musician",
  MODEL: "Model",
  PRESENTER: "Presenter",
  CONTENT_CREATOR: "Content creator",
};

export const TALENT_AVAILABILITIES: readonly TalentAvailability[] = [
  "AVAILABLE",
  "ASSIGNED",
  "UNAVAILABLE",
  "INACTIVE",
];

export const TALENT_AVAILABILITY_LABELS: Record<TalentAvailability, string> = {
  AVAILABLE: "Available",
  ASSIGNED: "Assigned",
  UNAVAILABLE: "Unavailable",
  INACTIVE: "Inactive",
};

/**
 * The moves the transition control offers from each state. Mirrors the graph
 * `talent.lifecycle.ts` enforces: `INACTIVE` is terminal, and the other three
 * states can move to one another as well as forward.
 */
export const NEXT_AVAILABILITIES: Record<
  TalentAvailability,
  readonly TalentAvailability[]
> = {
  AVAILABLE: ["ASSIGNED", "UNAVAILABLE", "INACTIVE"],
  ASSIGNED: ["AVAILABLE", "UNAVAILABLE", "INACTIVE"],
  UNAVAILABLE: ["AVAILABLE", "INACTIVE"],
  INACTIVE: [],
};

export const TALENT_ASSIGNMENT_STATUSES: readonly TalentAssignmentStatus[] = [
  "ASSIGNED",
  "COMPLETED",
  "CANCELLED",
];

export const TALENT_ASSIGNMENT_STATUS_LABELS: Record<
  TalentAssignmentStatus,
  string
> = {
  ASSIGNED: "Assigned",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** The moves the assignment status control offers. `ASSIGNED` is the only non-terminal state. */
export const NEXT_ASSIGNMENT_STATUSES: Record<
  TalentAssignmentStatus,
  readonly TalentAssignmentStatus[]
> = {
  ASSIGNED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** A user the manager control can offer. TAL-05 sources this from `GET /users`. */
export interface AssignableUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/** An event the assignment control can offer. TAL-05 sources this from `GET /events`. */
export interface AssignableEvent {
  id: string;
  name: string;
}

/** The person's name, or their email when no name is on file. */
export function personName(
  person: Pick<TalentPersonSummary, "firstName" | "lastName" | "email">,
): string {
  const parts = [person.firstName, person.lastName].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" ") : person.email;
}

/** The human label for a talent's discipline. */
export function talentTypeLabel(type: TalentType): string {
  return TALENT_TYPE_LABELS[type];
}

/** The human label for an availability state. */
export function availabilityLabel(availability: TalentAvailability): string {
  return TALENT_AVAILABILITY_LABELS[availability];
}

/** The human label for an assignment status. */
export function assignmentStatusLabel(status: TalentAssignmentStatus): string {
  return TALENT_ASSIGNMENT_STATUS_LABELS[status];
}

/** A short, human schedule-entry summary for a row. Dates render in the viewer's locale. */
export function scheduleSummary(
  item: Pick<TalentSchedule, "startAt" | "endAt">,
): string {
  const fmt = (iso: string): string =>
    new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  return `${fmt(item.startAt)} – ${fmt(item.endAt)}`;
}
