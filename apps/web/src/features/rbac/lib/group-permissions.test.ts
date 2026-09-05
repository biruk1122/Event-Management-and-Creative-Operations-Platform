import { describe, expect, it } from "vitest";

import {
  groupPermissionsByResource,
  matchesQuery,
  resourceLabel,
} from "./group-permissions";
import type { Permission } from "./rbac-types";

const PERMISSIONS: Permission[] = [
  { key: "role.read", description: "View roles and their grants." },
  { key: "role.create", description: "Create a configurable role." },
  { key: "task.read", description: "View a task." },
  { key: "task.review", description: "Record Approved or Changes Requested." },
];

describe("groupPermissionsByResource", () => {
  it("groups permissions by the segment before the first dot", () => {
    const groups = groupPermissionsByResource(PERMISSIONS);

    expect(groups).toEqual([
      { resource: "role", permissions: [PERMISSIONS[0], PERMISSIONS[1]] },
      { resource: "task", permissions: [PERMISSIONS[2], PERMISSIONS[3]] },
    ]);
  });

  it("preserves catalog order within and across groups", () => {
    const groups = groupPermissionsByResource([...PERMISSIONS].reverse());

    expect(groups.map((group) => group.resource)).toEqual(["task", "role"]);
    expect(groups[0]!.permissions.map((permission) => permission.key)).toEqual([
      "task.review",
      "task.read",
    ]);
  });

  it("returns no groups for an empty list", () => {
    expect(groupPermissionsByResource([])).toEqual([]);
  });
});

describe("resourceLabel", () => {
  it("capitalizes the resource name", () => {
    expect(resourceLabel("role")).toBe("Role");
    expect(resourceLabel("campaign")).toBe("Campaign");
  });
});

describe("matchesQuery", () => {
  it("matches on key or description, case-insensitively", () => {
    const permission = PERMISSIONS[3]!;

    expect(matchesQuery(permission, "review")).toBe(true);
    expect(matchesQuery(permission, "TASK.REVIEW")).toBe(true);
    expect(matchesQuery(permission, "approved")).toBe(true);
    expect(matchesQuery(permission, "unrelated")).toBe(false);
  });

  it("matches everything for a blank query", () => {
    expect(matchesQuery(PERMISSIONS[0]!, "   ")).toBe(true);
  });
});
