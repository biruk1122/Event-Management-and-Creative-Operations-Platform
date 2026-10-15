import type { components } from "@event-platform/api-client";

export type Production = components["schemas"]["ProductionResponse"];
export type ProductionStatus = Production["status"];
export type ProductionBudget = components["schemas"]["ProductionBudgetResponse"];
export type ProductionBudgetSummary =
  components["schemas"]["ProductionBudgetSummaryResponse"];
export type ProductionLocation =
  components["schemas"]["ProductionLocationResponse"];
export type ProductionLocationStatus = ProductionLocation["status"];

export const productionLocationStatusLabel: Record<
  ProductionLocationStatus,
  string
> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  CONFIRMED: "Confirmed",
  READY: "Ready",
};

export const PRODUCTION_LOCATION_STATUSES: readonly ProductionLocationStatus[] =
  ["PENDING", "IN_PROGRESS", "CONFIRMED", "READY"];

export const productionStatusLabel: Record<ProductionStatus, string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const nextProductionStatuses: Record<
  ProductionStatus,
  readonly ProductionStatus[]
> = {
  PLANNED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function productionPersonName(person: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  return (
    [person.firstName, person.lastName].filter(Boolean).join(" ") ||
    person.email
  );
}

export function productionDate(value: string | null): string {
  return value
    ? new Date(value).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Not set";
}
