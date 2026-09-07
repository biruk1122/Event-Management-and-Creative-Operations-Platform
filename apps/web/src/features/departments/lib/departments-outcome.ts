import type { Department } from "./departments-types";

export interface CreateDepartmentValues {
  name: string;
  description: string;
  managerId: string | null;
}

export interface DepartmentProfileValues {
  name: string;
  description: string;
}

/**
 * Result of a create/update attempt, in UI terms. DEP-05 maps the real
 * `POST /departments` / `PATCH /departments/:id` Problem Details codes onto
 * these cases; the form only needs to know which state to present.
 */
export type SaveDepartmentOutcome =
  | { status: "success"; department: Department }
  | { status: "name_conflict" }
  | { status: "manager_not_found" }
  | { status: "not_found" }
  | {
      status: "field_errors";
      fieldErrors: Partial<Record<keyof CreateDepartmentValues, string>>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type CreateDepartment = (
  values: CreateDepartmentValues,
) => Promise<SaveDepartmentOutcome>;

export type UpdateDepartment = (
  id: string,
  values: Partial<DepartmentProfileValues>,
) => Promise<SaveDepartmentOutcome>;

/** Result of `POST /departments/:id/deactivate`. */
export type DeactivateDepartmentOutcome =
  | { status: "success"; department: Department }
  | { status: "already_inactive" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type DeactivateDepartment = (
  id: string,
) => Promise<DeactivateDepartmentOutcome>;

/** Result of `POST /departments/:id/reactivate`. */
export type ReactivateDepartmentOutcome =
  | { status: "success"; department: Department }
  | { status: "already_active" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type ReactivateDepartment = (
  id: string,
) => Promise<ReactivateDepartmentOutcome>;

/** Result of `PUT /departments/:id/manager`. */
export type AssignManagerOutcome =
  | { status: "success"; department: Department }
  | { status: "manager_not_found" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type AssignManager = (
  id: string,
  managerId: string | null,
) => Promise<AssignManagerOutcome>;

/** Result of `DELETE /departments/:id`. */
export type DeleteDepartmentOutcome =
  | { status: "success" }
  | { status: "in_use" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type DeleteDepartment = (id: string) => Promise<DeleteDepartmentOutcome>;

/** Loads one department for the detail dialog; resolves `null` when it cannot. */
export type GetDepartment = (id: string) => Promise<Department | null>;
