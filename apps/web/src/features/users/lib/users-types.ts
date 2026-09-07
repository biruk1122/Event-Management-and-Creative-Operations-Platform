import type { components } from "@event-platform/api-client";

export type User = components["schemas"]["UserResponse"];
export type PaginatedUsers = components["schemas"]["PaginatedUsersResponse"];
export type UserRoleSummary = components["schemas"]["UserRoleSummary"];
export type UserStatus = User["status"];

export const USER_STATUSES: readonly UserStatus[] = ["ACTIVE", "INACTIVE"];

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

/** The full name, or a fallback when a profile has no name yet. */
export function displayName(
  user: Pick<User, "firstName" | "lastName">,
): string {
  const parts = [user.firstName, user.lastName].filter((part): part is string =>
    Boolean(part),
  );
  return parts.length > 0 ? parts.join(" ") : "Unnamed user";
}
