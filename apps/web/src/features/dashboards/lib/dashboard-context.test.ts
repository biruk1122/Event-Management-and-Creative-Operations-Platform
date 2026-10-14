import { describe, expect, it, vi } from "vitest";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { dashboardContext } from "./dashboard-context";
import { dashboardIdentity } from "../components/dashboard-screen";

vi.mock("@/lib/api/browser", () => ({ browserApi: { GET: vi.fn() } }));

const access: CurrentAccess = {
  userId: "user-1",
  grants: [],
  role: "DEPARTMENT_MANAGER",
  department: { id: "marketing", name: "Marketing", active: true },
};

describe("role and department dashboard presentation", () => {
  it("presents Super Admin as company-wide", () => {
    expect(
      dashboardContext({ ...access, role: "SUPER_ADMIN", department: null }),
    ).toMatchObject({
      title: "Super Admin dashboard",
      scope: "All departments",
    });
  });
  it("presents the assigned department without uppercase conversion", () => {
    expect(
      dashboardContext({
        ...access,
        department: {
          id: "office",
          name: "Manager / Event & Office Manager",
          active: true,
        },
      })?.title,
    ).toBe("Manager / Event & Office Manager dashboard");
  });
  it("distinguishes a member's personal work from department management", () => {
    expect(
      dashboardContext({ ...access, role: "DEPARTMENT_MEMBER" }),
    ).toMatchObject({
      role: "Department Member",
      title: "Marketing dashboard",
    });
  });
  it("requires assignment when the department is missing or inactive", () => {
    expect(dashboardContext({ ...access, department: null })?.title).toBe(
      "Department assignment required",
    );
    expect(
      dashboardContext({
        ...access,
        department: { ...access.department!, active: false },
      })?.scope,
    ).toBe("Not assigned");
  });
  it("does not reuse dashboard caches after a department transfer", () => {
    expect(dashboardIdentity(access, 1)).not.toEqual(
      dashboardIdentity(
        {
          ...access,
          department: { id: "production", name: "Production", active: true },
        },
        1,
      ),
    );
  });
});
