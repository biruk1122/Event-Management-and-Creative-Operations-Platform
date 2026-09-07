import type { PermissionScope, Role } from "./rbac-types";

export type RbacFailure = {
  status:
    | "permission_denied"
    | "unexpected"
    | "session_expired"
    | "csrf_invalid"
    | "rate_limited"
    | "role_not_found";
};

export const RBAC_FAILURE_MESSAGES = {
  session_expired:
    "Your session expired. Sign in again in another tab, then retry. Your input is kept here.",
  csrf_invalid:
    "Your security token expired. Sign in again in another tab, then retry.",
  rate_limited: "Too many requests. Wait a moment, then try again.",
  role_not_found: "This role no longer exists. Close it and refresh the list.",
};

export interface RoleFormValues {
  name: string;
  description: string;
}

/**
 * Result of a role create/rename attempt, expressed in UI terms. The real
 * gateway (RBAC-05) maps `POST /roles` and `PATCH /roles/:id` Problem Details
 * codes onto these cases; the form only needs to know which state to present.
 */
export type SaveRoleOutcome =
  | { status: "success"; role: Role }
  | { status: "name_conflict" }
  | {
      status: "field_errors";
      fieldErrors: Partial<Record<keyof RoleFormValues, string>>;
    }
  | RbacFailure;

export type CreateRole = (values: RoleFormValues) => Promise<SaveRoleOutcome>;
export type UpdateRole = (
  id: string,
  values: RoleFormValues,
) => Promise<SaveRoleOutcome>;

/** Result of a delete attempt against `DELETE /roles/:id`. */
export type DeleteRoleOutcome =
  | { status: "success" }
  | { status: "is_system" }
  | { status: "in_use" }
  | RbacFailure;

export type DeleteRole = (id: string) => Promise<DeleteRoleOutcome>;

/** Result of `POST /roles/:id/permissions`. */
export type AddGrantOutcome =
  { status: "success" } | { status: "already_exists" } | RbacFailure;

export type AddGrant = (
  roleId: string,
  permissionKey: string,
  scope: PermissionScope,
) => Promise<AddGrantOutcome>;

/** Result of `DELETE /roles/:id/permissions/:key/:scope`. */
export type RemoveGrantOutcome =
  { status: "success" } | { status: "not_found" } | RbacFailure;

export type RemoveGrant = (
  roleId: string,
  permissionKey: string,
  scope: PermissionScope,
) => Promise<RemoveGrantOutcome>;

/** Unsaved input only; authoritative role data stays in the query cache. */
export interface RbacDrafts {
  createOpen?: boolean;
  create?: RoleFormValues;
  selectedRoleId?: string | null;
  roles: Record<string, Partial<RoleFormValues>>;
}
