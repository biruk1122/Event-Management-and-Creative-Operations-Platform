import { describe, expect, it } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { canAccessEmployeeManagement } from "./employee-access";

function access(
  role: CurrentAccess["role"],
  department: CurrentAccess["department"] = null,
): CurrentAccess {
  return { userId: "u1", role, department, grants: [] } as CurrentAccess;
}

describe("canAccessEmployeeManagement", () => {
  it("always allows a Super Admin", () => {
    expect(canAccessEmployeeManagement(access("SUPER_ADMIN"))).toBe(true);
  });

  it("allows the HR & Executive Officer department's own manager", () => {
    expect(
      canAccessEmployeeManagement(
        access("DEPARTMENT_MANAGER", {
          id: "dept-hr",
          name: "HR & Executive Officer",
          active: true,
        }),
      ),
    ).toBe(true);
  });

  it("denies a Department Manager of any other department", () => {
    expect(
      canAccessEmployeeManagement(
        access("DEPARTMENT_MANAGER", {
          id: "dept-marketing",
          name: "Marketing",
          active: true,
        }),
      ),
    ).toBe(false);
  });

  it("denies a Department Member in the HR & Executive Officer department", () => {
    expect(
      canAccessEmployeeManagement(
        access("DEPARTMENT_MEMBER", {
          id: "dept-hr",
          name: "HR & Executive Officer",
          active: true,
        }),
      ),
    ).toBe(false);
  });

  it("denies an HR manager whose department has been deactivated", () => {
    expect(
      canAccessEmployeeManagement(
        access("DEPARTMENT_MANAGER", {
          id: "dept-hr",
          name: "HR & Executive Officer",
          active: false,
        }),
      ),
    ).toBe(false);
  });

  it("denies a caller with no role assignment", () => {
    expect(canAccessEmployeeManagement(access(null))).toBe(false);
  });
});
