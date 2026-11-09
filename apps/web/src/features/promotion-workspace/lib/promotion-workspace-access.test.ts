import { describe, expect, it } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import {
  canEnterPromotionWorkspace,
  isPromotionOverseer,
  promotionSections,
  promotionWorkspaceContext,
  resolvePromotionSection,
} from "./promotion-workspace-access";

const PROMOTION = { id: "dept-promo", name: "Promotion", active: true };
const MARKETING = { id: "dept-mkt", name: "Marketing", active: true };

function access(overrides: Partial<CurrentAccess>): CurrentAccess {
  return {
    userId: "user-1",
    role: null,
    department: null,
    grants: [],
    overseenDepartments: [],
    ...overrides,
  };
}

const MANAGER_READS: CurrentAccess["grants"] = [
  "campaign.read",
  "campaign.budget.read",
  "task.read",
  "partner.read",
  "report.read",
].map((permissionKey) => ({ permissionKey, scope: "DEPARTMENT" }));

const promotionManager = access({
  role: "DEPARTMENT_MANAGER",
  department: PROMOTION,
  grants: MANAGER_READS,
});
const marketingManager = access({
  role: "DEPARTMENT_MANAGER",
  department: MARKETING,
  grants: MANAGER_READS,
  overseenDepartments: [{ id: PROMOTION.id, name: "Promotion" }],
});

describe("Promotion workspace entry", () => {
  it("admits Super Admin, Promotion staff and the overseeing manager", () => {
    expect(canEnterPromotionWorkspace(access({ role: "SUPER_ADMIN" }))).toBe(
      true,
    );
    expect(canEnterPromotionWorkspace(promotionManager)).toBe(true);
    expect(
      canEnterPromotionWorkspace(
        access({ role: "DEPARTMENT_MEMBER", department: PROMOTION }),
      ),
    ).toBe(true);
    expect(canEnterPromotionWorkspace(marketingManager)).toBe(true);
  });

  it("refuses everyone else, Admin and Marketing members included", () => {
    expect(canEnterPromotionWorkspace(access({ role: "ADMIN" }))).toBe(false);
    expect(
      canEnterPromotionWorkspace(
        access({ role: "DEPARTMENT_MEMBER", department: MARKETING }),
      ),
    ).toBe(false);
    expect(
      canEnterPromotionWorkspace(
        access({ role: "DEPARTMENT_MANAGER", department: MARKETING }),
      ),
    ).toBe(false);
    expect(
      canEnterPromotionWorkspace(
        access({
          role: "DEPARTMENT_MEMBER",
          department: { ...PROMOTION, active: false },
        }),
      ),
    ).toBe(false);
    // A member never inherits oversight, even if the list were to name it.
    expect(
      isPromotionOverseer(
        access({
          role: "DEPARTMENT_MEMBER",
          department: MARKETING,
          overseenDepartments: [{ id: PROMOTION.id, name: "Promotion" }],
        }),
      ),
    ).toBe(false);
  });

  it("labels each viewer and marks oversight read-only", () => {
    expect(promotionWorkspaceContext(promotionManager)).toMatchObject({
      roleLabel: "Promotional Manager",
      readOnly: false,
    });
    expect(promotionWorkspaceContext(marketingManager)).toMatchObject({
      roleLabel: "Marketing Manager · read-only",
      readOnly: true,
    });
    expect(
      promotionWorkspaceContext(access({ role: "SUPER_ADMIN" })),
    ).toMatchObject({ readOnly: false });
    expect(promotionWorkspaceContext(access({ role: "ADMIN" }))).toBeNull();
  });
});

describe("Promotion workspace sections", () => {
  it("lists all ten sections in order for a manager who can read every module", () => {
    expect(promotionSections(promotionManager).map((s) => s.label)).toEqual([
      "Overview",
      "Campaigns",
      "Promotional Activities",
      "Team Tasks",
      "Partnerships",
      "Creative Requests",
      "Event Promotions",
      "Budget",
      "Reports",
      "Calendar",
    ]);
  });

  it("marks the sections later phases build", () => {
    const later = promotionSections(promotionManager)
      .filter((section) => section.comingInPhase !== null)
      .map((section) => section.id);
    expect(later).toEqual(["creative-requests", "event-promotions", "budget"]);
  });

  it("hides a section whose module the viewer cannot read", () => {
    const tasksOnly = access({
      role: "DEPARTMENT_MEMBER",
      department: PROMOTION,
      grants: [{ permissionKey: "task.read", scope: "DEPARTMENT" }],
    });
    const ids = promotionSections(tasksOnly).map((section) => section.id);
    expect(ids).toContain("tasks");
    expect(ids).not.toContain("campaigns");
    expect(ids).not.toContain("partnerships");
    expect(ids).not.toContain("budget");
  });

  it("falls back to Overview for an unknown or forbidden tab", () => {
    expect(resolvePromotionSection(promotionManager, "reports")).toBe(
      "reports",
    );
    expect(resolvePromotionSection(promotionManager, "nope")).toBe("overview");
    expect(resolvePromotionSection(promotionManager, null)).toBe("overview");
    const tasksOnly = access({
      role: "DEPARTMENT_MEMBER",
      department: PROMOTION,
      grants: [{ permissionKey: "task.read", scope: "DEPARTMENT" }],
    });
    expect(resolvePromotionSection(tasksOnly, "campaigns")).toBe("overview");
  });
});
