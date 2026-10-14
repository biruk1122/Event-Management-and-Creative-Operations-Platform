import type { Supplier, SupplierStatus } from "./suppliers-types";

/** The fields the create and edit forms collect. */
export interface SupplierFieldValues {
  name: string;
  category: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
}

type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** Result of `POST /suppliers`. */
export type CreateSupplierOutcome =
  | { status: "success"; supplier: Supplier }
  | { status: "duplicate" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof SupplierFieldValues>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type CreateSupplier = (
  values: SupplierFieldValues,
) => Promise<CreateSupplierOutcome>;

/** Result of `PATCH /suppliers/:id`. */
export type UpdateSupplierOutcome =
  | { status: "success"; supplier: Supplier }
  | { status: "duplicate" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof SupplierFieldValues>;
    }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type UpdateSupplier = (
  id: string,
  values: Partial<SupplierFieldValues> & { status?: SupplierStatus },
) => Promise<UpdateSupplierOutcome>;

/** Loads one supplier for the detail dialog; resolves `null` when it cannot. */
export type GetSupplier = (id: string) => Promise<Supplier | null>;
