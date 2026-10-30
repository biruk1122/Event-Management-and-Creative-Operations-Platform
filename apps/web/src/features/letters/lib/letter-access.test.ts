import { describe, expect, it } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { canAccessAdministrationDocuments } from "./letter-access";

function access(
  role: CurrentAccess["role"],
  department: CurrentAccess["department"] = null,
): CurrentAccess {
  return { userId: "u1", role, department, grants: [] } as CurrentAccess;
}

describe("canAccessAdministrationDocuments", () => {
  it("always allows a Super Admin", () => {
    expect(canAccessAdministrationDocuments(access("SUPER_ADMIN"))).toBe(true);
  });

  it("allows the HR & Executive Officer department's own manager", () => {
    expect(
      canAccessAdministrationDocuments(
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
      canAccessAdministrationDocuments(
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
      canAccessAdministrationDocuments(
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
      canAccessAdministrationDocuments(
        access("DEPARTMENT_MANAGER", {
          id: "dept-hr",
          name: "HR & Executive Officer",
          active: false,
        }),
      ),
    ).toBe(false);
  });

  it("denies a caller with no role assignment", () => {
    expect(canAccessAdministrationDocuments(access(null))).toBe(false);
  });
});
