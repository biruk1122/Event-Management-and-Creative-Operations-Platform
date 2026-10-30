import type { components } from "@event-platform/api-client";

export type Partner = components["schemas"]["PartnerResponse"];
export type PaginatedPartners =
  components["schemas"]["PaginatedPartnersResponse"];
export type PartnerActivity = components["schemas"]["PartnerActivityResponse"];
export type PaginatedPartnerActivities =
  components["schemas"]["PaginatedPartnerActivitiesResponse"];
export type PartnerPerson = components["schemas"]["PartnerPersonSummary"];

export type PartnerStatus = Partner["status"];

export const PARTNER_STATUSES: readonly PartnerStatus[] = [
  "PROSPECTIVE",
  "IN_DISCUSSION",
  "COMMITTED",
  "DECLINED",
  "COMPLETED",
];

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  PROSPECTIVE: "Prospective",
  IN_DISCUSSION: "In discussion",
  COMMITTED: "Committed",
  DECLINED: "Declined",
  COMPLETED: "Completed",
};

export function partnerStatusLabel(status: PartnerStatus): string {
  return PARTNER_STATUS_LABELS[status];
}

export function partnerStatusVariant(status: PartnerStatus) {
  if (status === "COMMITTED" || status === "COMPLETED")
    return "secondary" as const;
  if (status === "DECLINED") return "outline" as const;
  return "outline" as const;
}

export function personName(person: PartnerPerson | null): string {
  if (!person) return "Unassigned";
  const name = [person.firstName, person.lastName].filter(Boolean).join(" ");
  return name || person.email;
}
