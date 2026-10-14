import type { CurrentAccess } from "@/features/auth/api/access-queries";

/** Supplier authorization mirrors `SuppliersService`: the backend resolves
 * scope server-side - organization scope sees the shared directory and every
 * department's private entries, department scope sees the shared directory
 * plus only its own department's (EOM-01). */
type Grant = CurrentAccess["grants"][number];

function holdsAny(grants: readonly Grant[], key: string): boolean {
  return grants.some(
    (grant) =>
      grant.permissionKey === key &&
      (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
  );
}

export function canReadSuppliers(access: CurrentAccess): boolean {
  return holdsAny(access.grants, "supplier.read");
}

export interface SupplierAbilities {
  canCreate: boolean;
  canUpdate: boolean;
}

export function supplierAbilities(access: CurrentAccess): SupplierAbilities {
  return {
    canCreate: holdsAny(access.grants, "supplier.create"),
    canUpdate: holdsAny(access.grants, "supplier.update"),
  };
}
