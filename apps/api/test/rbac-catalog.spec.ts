import { describe, expect, it } from "vitest";

import { ADMIN_ORGANIZATION_PERMISSION_KEYS } from "../src/common/security/department-access.policy.js";
import { PERMISSIONS, ROLE_DEFINITIONS } from "../src/rbac/rbac-catalog.js";

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

  describe("Admin role", () => {
    const admin = () => ROLE_DEFINITIONS.find((role) => role.name === "Admin");

    it("is seeded as a fourth system role", () => {
      expect(ROLE_DEFINITIONS.map((role) => role.name)).toEqual([
        "Super Admin",
        "Admin",
        "Department Manager",
        "Department Member",
      ]);
    });

    it("holds its organization-scope grants only from the explicit allow-list", () => {
      const organization = admin()!
        .grants.filter((grant) => grant.scope === "ORGANIZATION")
        .map((grant) => grant.permissionKey)
        .sort();
      expect(organization).toEqual(
        [...ADMIN_ORGANIZATION_PERMISSION_KEYS].sort(),
      );
    });

    it("holds no user, role, settings, audit, HR, delete or approval permission", () => {
      const forbidden =
        // event.delete is granted on purpose: Admin manages events organization-wide.
        /^(user|role|settings|audit|employee|letter|document|activity)\.|(?<!^event)\.delete$|^expense\.approve$|^department\.(create|update|delete|assign_)/;
      const held = admin()!.grants.filter((grant) =>
        forbidden.test(grant.permissionKey),
      );
      expect(held).toEqual([]);
    });

    it("can read tasks and reports across departments and coordinate them", () => {
      expect(admin()!.grants).toEqual(
        expect.arrayContaining([
          { permissionKey: "task.create", scope: "ORGANIZATION" },
          { permissionKey: "task.assign", scope: "ORGANIZATION" },
          { permissionKey: "task.review", scope: "ORGANIZATION" },
          { permissionKey: "report.review", scope: "ORGANIZATION" },
          { permissionKey: "analytics.management.read", scope: "ORGANIZATION" },
          { permissionKey: "task.submit", scope: "SELF" },
        ]),
      );
    });

    it("leaves designating a department's reporting Admin to Super Admin only", () => {
      expect(PERMISSIONS.map((p) => p.key)).toContain(
        "department.assign_reporting_admin",
      );
      const holders = ROLE_DEFINITIONS.filter((role) =>
        role.grants.some(
          (grant) =>
            grant.permissionKey === "department.assign_reporting_admin",
        ),
      ).map((role) => role.name);
      expect(holders).toEqual(["Super Admin"]);
    });

    it("gives Department Manager department-scope report review (members report to them)", () => {
      const manager = ROLE_DEFINITIONS.find(
        (role) => role.name === "Department Manager",
      );
      expect(manager!.grants).toContainEqual({
        permissionKey: "report.review",
        scope: "DEPARTMENT",
      });
    });
  });
});
