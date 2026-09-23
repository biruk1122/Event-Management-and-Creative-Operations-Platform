import type { components } from "@event-platform/api-client";

export type Production = components["schemas"]["ProductionResponse"];
export type ProductionStatus = Production["status"];

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
