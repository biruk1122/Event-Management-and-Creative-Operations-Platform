import type { components } from "@event-platform/api-client";

export type Role = components["schemas"]["RoleResponse"];
export type RoleWithGrants = components["schemas"]["RoleWithGrantsResponse"];
export type Permission = components["schemas"]["PermissionResponse"];
export type RoleGrant = components["schemas"]["RoleGrantResponse"];
export type PermissionScope = RoleGrant["scope"];

/** Every configurable scope, in the fixed display order used across the UI. */
export const PERMISSION_SCOPES: readonly PermissionScope[] = [
  "ORGANIZATION",
  "DEPARTMENT",
  "TEAM",
  "WORKSPACE",
  "SELF",
  "MANAGEMENT",
];

export const SCOPE_LABELS: Record<PermissionScope, string> = {
  ORGANIZATION: "Organization",
  DEPARTMENT: "Department",
  TEAM: "Team",
  WORKSPACE: "Workspace",
  SELF: "Self",
  MANAGEMENT: "Management",
};
