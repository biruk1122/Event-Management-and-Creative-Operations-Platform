import type { components } from "@event-platform/api-client";

export type Campaign = components["schemas"]["CampaignResponse"];
export type PaginatedCampaigns =
  components["schemas"]["PaginatedCampaignsResponse"];
export type CampaignBudget = components["schemas"]["CampaignBudgetResponse"];
export type CampaignProgress = components["schemas"]["CampaignProgress"];
export type CampaignActivity =
  components["schemas"]["CampaignActivityResponse"];
export type CampaignPersonSummary =
  components["schemas"]["CampaignPersonSummary"];
export type CampaignTeamSummary = components["schemas"]["CampaignTeamSummary"];

/** The owning module of a campaign. Mirrors the API `campaignType` enum. */
export type CampaignType = Campaign["campaignType"];

/** The campaign lifecycle state. Mirrors the API `status` enum. */
export type CampaignStatus = Campaign["status"];

/** The state of one campaign activity. Mirrors the API activity `status` enum. */
export type CampaignActivityStatus = CampaignActivity["status"];

export const CAMPAIGN_TYPES: readonly CampaignType[] = [
  "MARKETING",
  "PROMOTION",
];

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  MARKETING: "Marketing",
  PROMOTION: "Promotion",
};

export const CAMPAIGN_STATUSES: readonly CampaignStatus[] = [
  "PLANNED",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/**
 * The lifecycle moves the transition control offers from each state. Mirrors
 * the graph `CampaignsService` enforces: `COMPLETED` and `CANCELLED` are
 * terminal. Entry criteria and who may make a move are open in OD-03 and owned
 * by the API.
 */
export const NEXT_STATUSES: Record<CampaignStatus, readonly CampaignStatus[]> =
  {
    PLANNED: ["ACTIVE", "CANCELLED"],
    ACTIVE: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
  };

export const ACTIVITY_STATUSES: readonly CampaignActivityStatus[] = [
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

export const ACTIVITY_STATUS_LABELS: Record<CampaignActivityStatus, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** A user the manager control can offer. CAM-05 sources this from `GET /users`. */
export interface AssignableUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/** A team the "assign team" control can offer. CAM-05 sources this from `GET /teams`. */
export interface AssignableTeam {
  id: string;
  name: string;
}

/**
 * An event the "related event" control can offer. CAM-05 sources this from
 * `GET /events`.
 */
export interface AssignableEvent {
  id: string;
  name: string;
}

/** The person's name, or their email when no name is on file. */
export function personName(
  person: Pick<CampaignPersonSummary, "firstName" | "lastName" | "email">,
): string {
  const parts = [person.firstName, person.lastName].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" ") : person.email;
}

/** The human label for a campaign type. */
export function campaignTypeLabel(type: CampaignType): string {
  return CAMPAIGN_TYPE_LABELS[type];
}

/** The human label for a campaign lifecycle state. */
export function campaignStatusLabel(status: CampaignStatus): string {
  return CAMPAIGN_STATUS_LABELS[status];
}

/** The human label for an activity state. */
export function activityStatusLabel(status: CampaignActivityStatus): string {
  return ACTIVITY_STATUS_LABELS[status];
}

/**
 * A short, human schedule summary for a row. Dates render in the viewer's
 * locale; a one-sided range shows the known end. CAM-05 may refine the
 * timezone presentation (OD-15).
 */
export function scheduleSummary(
  item:
    | Pick<Campaign, "startAt" | "endAt">
    | Pick<CampaignActivity, "startAt" | "endAt">,
): string {
  const fmt = (iso: string): string =>
    new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  if (item.startAt && item.endAt) {
    return `${fmt(item.startAt)} – ${fmt(item.endAt)}`;
  }
  if (item.startAt) return `From ${fmt(item.startAt)}`;
  if (item.endAt) return `Until ${fmt(item.endAt)}`;
  return "Not scheduled";
}

/** Formats a budget for display, or a dash when none is set. */
export function budgetSummary(budget: CampaignBudget | null): string {
  if (!budget || budget.amount === null || budget.currency === null) {
    return "—";
  }
  return `${budget.amount} ${budget.currency}`;
}

/**
 * The progress line shown beside the bar: counts and a whole percent, or a
 * plain statement while nothing counts toward progress yet.
 */
export function progressSummary(progress: CampaignProgress): string {
  if (progress.percent === null) return "No activities counted yet";
  return `${progress.completedActivities} of ${progress.totalActivities} activities · ${progress.percent}%`;
}

/**
 * Derives progress from a set of activities with the same documented formula
 * the API uses (cancelled activities are excluded; the percent is the rounded
 * share of the remaining activities that are completed; null when none
 * remain). The detail view uses it to keep the bar current after an activity
 * change; CAM-05 may replace it with a refetch of the campaign.
 */
export function progressOf(
  activities: readonly Pick<CampaignActivity, "status">[],
): CampaignProgress {
  const counted = activities.filter((item) => item.status !== "CANCELLED");
  const completed = counted.filter((item) => item.status === "COMPLETED");
  return {
    completedActivities: completed.length,
    totalActivities: counted.length,
    percent:
      counted.length === 0
        ? null
        : Math.round((completed.length * 100) / counted.length),
  };
}

/** What a campaign is about: its related event's name, its product, or nothing. */
export function subjectSummary(
  campaign: Pick<Campaign, "eventId" | "productName">,
  events: readonly AssignableEvent[],
): string {
  if (campaign.productName) return `Product: ${campaign.productName}`;
  if (campaign.eventId) {
    const event = events.find((item) => item.id === campaign.eventId);
    return `Event: ${event?.name ?? "Unknown event"}`;
  }
  return "No related subject";
}
