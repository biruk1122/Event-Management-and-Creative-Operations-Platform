import type { User } from "./users-types";

export interface CreateUserValues {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  profileImage: string;
  temporaryPassword: string;
  roleId: string | null;
}

export interface ProfileValues {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  profileImage: string;
}

/**
 * Result of a create/update attempt, in UI terms. USR-05 maps the real
 * `POST /users` / `PATCH /users/:id` Problem Details codes onto these cases;
 * the form only needs to know which state to present.
 */
export type SaveUserOutcome =
  | { status: "success"; user: User }
  | { status: "email_conflict" }
  | { status: "role_not_found" }
  | {
      status: "field_errors";
      fieldErrors: Partial<Record<keyof CreateUserValues, string>>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type CreateUser = (values: CreateUserValues) => Promise<SaveUserOutcome>;
export type UpdateUser = (
  id: string,
  values: Partial<ProfileValues>,
) => Promise<SaveUserOutcome>;

/** Result of `POST /users/:id/deactivate`. */
export type DeactivateUserOutcome =
  | { status: "success"; user: User }
  | { status: "already_inactive" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type DeactivateUser = (id: string) => Promise<DeactivateUserOutcome>;

/** Result of `POST /users/:id/reactivate`. */
export type ReactivateUserOutcome =
  | { status: "success"; user: User }
  | { status: "already_active" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type ReactivateUser = (id: string) => Promise<ReactivateUserOutcome>;

/** Result of `PUT /users/:id/role`. */
export type AssignRoleOutcome =
  | { status: "success"; user: User }
  | { status: "role_not_found" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type AssignRole = (
  id: string,
  roleId: string | null,
) => Promise<AssignRoleOutcome>;
