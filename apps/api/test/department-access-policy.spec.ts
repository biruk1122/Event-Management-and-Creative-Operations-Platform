import { describe, expect, it } from "vitest";
import {
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
  it("supports three role identities and rejects obsolete or custom roles", () => {
    expect(platformRole("Super Admin")).toBe("SUPER_ADMIN");
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
});
