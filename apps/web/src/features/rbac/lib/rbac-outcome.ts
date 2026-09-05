import type { PermissionScope, Role } from "./rbac-types";

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
  | { status: "permission_denied" }
  | { status: "unexpected" };

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
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type DeleteRole = (id: string) => Promise<DeleteRoleOutcome>;

/** Result of `POST /roles/:id/permissions`. */
export type AddGrantOutcome =
  | { status: "success" }
  | { status: "already_exists" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type AddGrant = (
  roleId: string,
  permissionKey: string,
  scope: PermissionScope,
) => Promise<AddGrantOutcome>;

/** Result of `DELETE /roles/:id/permissions/:key/:scope`. */
export type RemoveGrantOutcome =
  | { status: "success" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type RemoveGrant = (
  roleId: string,
  permissionKey: string,
  scope: PermissionScope,
) => Promise<RemoveGrantOutcome>;
