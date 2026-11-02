import { describe, expect, it } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { dashboardContext } from "./dashboard-context";

describe("dashboardContext - Admin", () => {
  it("describes Admin as the cross-department coordinator without Super Admin authority", () => {
    const context = dashboardContext({
      userId: "admin-1",
      role: "ADMIN",
      grants: [],
      department: { id: "d1", name: "Marketing", active: true },
    } as unknown as CurrentAccess);
    expect(context).toMatchObject({
      title: "Admin dashboard",
      role: "Admin",
      scope: "All departments",
    });
    // Coordination is cross-department, but user/role administration stays
    // with Super Admin - the copy must not promise otherwise.
    expect(context?.description).toMatch(/stays with Super Admin/);
  });
});
