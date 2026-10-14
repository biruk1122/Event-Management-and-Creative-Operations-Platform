import type { components } from "@event-platform/api-client";

export type Supplier = components["schemas"]["SupplierResponse"];
export type PaginatedSuppliers =
  components["schemas"]["PaginatedSuppliersResponse"];

export type SupplierStatus = Supplier["status"];

export const SUPPLIER_STATUSES: readonly SupplierStatus[] = [
  "ACTIVE",
  "INACTIVE",
];

export const SUPPLIER_STATUS_LABELS: Record<SupplierStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

export function supplierStatusLabel(status: SupplierStatus): string {
  return SUPPLIER_STATUS_LABELS[status];
}

export function supplierStatusVariant(status: SupplierStatus) {
  return status === "ACTIVE" ? ("secondary" as const) : ("outline" as const);
}

/** `null` means the shared, organization-wide directory; set means a
 * department-private entry, visible only to that department (EOM-01). */
export function supplierScopeLabel(departmentId: string | null): string {
  return departmentId === null ? "Shared directory" : "Department-private";
}
