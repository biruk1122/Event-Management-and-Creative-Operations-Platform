import { describe, expect, it } from "vitest";
import {
  ADMIN_ORGANIZATION_PERMISSION_KEYS,
  constrainDepartmentGrants,
  platformRole,
  supportedDepartment,
  type DepartmentAccessContext,
} from "../src/common/security/department-access.policy.js";

const department = { id: "marketing-id", name: "Marketing", active: true };
const grants = [
  { permissionKey: "profile.read", scope: "SELF" as const },
  { permissionKey: "task.read", scope: "SELF" as const },
  { permissionKey: "task.read", scope: "DEPARTMENT" as const },
  { permissionKey: "user.assign_role", scope: "ORGANIZATION" as const },
  { permissionKey: "analytics.management.read", scope: "MANAGEMENT" as const },
];

describe("department access policy", () => {
  it("supports four role identities and rejects obsolete or custom roles", () => {
    expect(platformRole("Super Admin")).toBe("SUPER_ADMIN");
    expect(platformRole("Admin")).toBe("ADMIN");
    expect(platformRole("ADMIN")).toBe("ADMIN");
    expect(platformRole("Department Manager")).toBe("DEPARTMENT_MANAGER");
    expect(platformRole("Department Member")).toBe("DEPARTMENT_MEMBER");
    expect(platformRole("Team Member")).toBe("DEPARTMENT_MEMBER");
    expect(platformRole("Management/Administrator")).toBeNull();
    expect(platformRole("Talent Manager")).toBeNull();
    expect(platformRole("Custom manager")).toBeNull();
  });

  it("uses the requested department display name, not an uppercase version", () => {
    expect(supportedDepartment("Manager / Event & Office Manager")).toBe(true);
    expect(supportedDepartment("MANAGER / EVENT & OFFICE MANAGER")).toBe(false);
  });

  it("preserves Super Admin grants without requiring a department", () => {
    expect(
      constrainDepartmentGrants(
        { role: "SUPER_ADMIN", department: null },
        grants,
      ),
    ).toEqual(grants);
  });

  it("prevents a manager from acquiring organization-wide grants", () => {
    expect(
      constrainDepartmentGrants(
        { role: "DEPARTMENT_MANAGER", department },
        grants,
      ),
    ).toEqual(grants.slice(0, 3));
  });

  it("prevents a member from acquiring department-wide grants", () => {
    expect(
      constrainDepartmentGrants(
        { role: "DEPARTMENT_MEMBER", department },
        grants,
      ),
    ).toEqual(grants.slice(0, 2));
  });

  it.each<DepartmentAccessContext>([
    { role: null, department },
    { role: "DEPARTMENT_MANAGER", department: null },
    { role: "DEPARTMENT_MEMBER", department: { ...department, active: false } },
    {
      role: "DEPARTMENT_MANAGER",
      department: { ...department, name: "Unknown" },
    },
  ])("fails closed for an invalid account assignment: %j", (context) => {
    expect(constrainDepartmentGrants(context, grants)).toEqual([grants[0]]);
  });

  describe("Admin", () => {
    const orgGrant = (permissionKey: string) => ({
      permissionKey,
      scope: "ORGANIZATION" as const,
    });

    it("keeps organization grants only for the explicit coordination allow-list", () => {
      const allowed = ADMIN_ORGANIZATION_PERMISSION_KEYS.map(orgGrant);
      const forbidden = [
        "user.assign_role",
        "user.create",
        "role.update",
        "settings.update",
        "audit.read",
        "employee.read",
        "expense.approve",
        "task.delete",
        "department.assign_reporting_admin",
      ].map(orgGrant);
      const result = constrainDepartmentGrants({ role: "ADMIN", department }, [
        ...allowed,
        ...forbidden,
      ]);
      expect(result).toEqual(allowed);
    });

    it("never keeps management-scope grants even for an allow-listed key", () => {
      expect(
        constrainDepartmentGrants({ role: "ADMIN", department }, [
          { permissionKey: "analytics.management.read", scope: "MANAGEMENT" },
        ]),
      ).toEqual([]);
    });

    it("is exempt from the department requirement and keeps its organization grants", () => {
      const allowed = ADMIN_ORGANIZATION_PERMISSION_KEYS.map(orgGrant);
      const profile = [
        { permissionKey: "profile.read", scope: "SELF" as const },
        ...allowed,
      ];
      expect(
        constrainDepartmentGrants({ role: "ADMIN", department: null }, profile),
      ).toEqual(profile);
      expect(
        constrainDepartmentGrants(
          { role: "ADMIN", department: { ...department, active: false } },
          profile,
        ),
      ).toEqual(profile);
      expect(
        constrainDepartmentGrants(
          {
            role: "ADMIN",
            department: { id: "x", name: "Unsupported", active: true },
          },
          profile,
        ),
      ).toEqual(profile);
    });

    it("drops department-scoped grants for an Admin with no supported department", () => {
      const departmentGrant = {
        permissionKey: "event.read",
        scope: "DEPARTMENT" as const,
      };
      expect(
        constrainDepartmentGrants({ role: "ADMIN", department: null }, [
          departmentGrant,
        ]),
      ).toEqual([]);
    });

    it("still requires an active supported department for non-Admin roles", () => {
      const profile = [
        { permissionKey: "profile.read", scope: "SELF" as const },
        { permissionKey: "event.read", scope: "DEPARTMENT" as const },
      ];
      expect(
        constrainDepartmentGrants(
          { role: "DEPARTMENT_MANAGER", department: null },
          profile,
        ),
      ).toEqual([profile[0]]);
    });

    it("does not widen manager or member grants", () => {
      const allowed = ADMIN_ORGANIZATION_PERMISSION_KEYS.map(orgGrant);
      expect(
        constrainDepartmentGrants(
          { role: "DEPARTMENT_MANAGER", department },
          allowed,
        ),
      ).toEqual([]);
      expect(
        constrainDepartmentGrants(
          { role: "DEPARTMENT_MEMBER", department },
          allowed,
        ),
      ).toEqual([]);
    });
  });
});
