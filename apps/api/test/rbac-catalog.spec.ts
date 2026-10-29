import { describe, expect, it } from "vitest";

import { ROLE_DEFINITIONS } from "../src/rbac/rbac-catalog.js";

describe("rbac catalog", () => {
  it("grants Department Manager leave.read alongside leave.review and leave.grant.manage", () => {
    const departmentManager = ROLE_DEFINITIONS.find(
      (role) => role.name === "Department Manager",
    );
    expect(departmentManager).toBeDefined();

    // Both the leave review and HR-grant routes gate on `leave.read` at the
    // transport boundary (PermissionsGuard) before the service's own
    // department/organization visibility-widening logic ever runs; without
    // it a Department Manager could never reach GET /leave/requests,
    // /leave/grants, /leave/balance, or /leave/calendar at all.
    expect(departmentManager!.grants).toEqual(
      expect.arrayContaining([
        { permissionKey: "leave.read", scope: "DEPARTMENT" },
        { permissionKey: "leave.review", scope: "DEPARTMENT" },
        { permissionKey: "leave.grant.manage", scope: "DEPARTMENT" },
      ]),
    );
  });

  it("grants Department Manager the same SELF-scope task self-report keys as Department Member, so a Manager assigned a task by Super Admin can report back on it too", () => {
    const departmentManager = ROLE_DEFINITIONS.find(
      (role) => role.name === "Department Manager",
    );
    expect(departmentManager).toBeDefined();

    expect(departmentManager!.grants).toEqual(
      expect.arrayContaining([
        { permissionKey: "task.update_status", scope: "SELF" },
        { permissionKey: "task.update_progress", scope: "SELF" },
        { permissionKey: "task.submit", scope: "SELF" },
      ]),
    );
  });
});
