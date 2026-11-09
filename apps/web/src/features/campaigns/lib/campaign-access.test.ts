import { describe, expect, it } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import {
  campaignAbilities,
  campaignAbilitiesFor,
  campaignMovesFor,
  canReadCampaigns,
} from "./campaign-access";

function access(...grants: [string, string?][]): CurrentAccess {
  return {
    userId: "u1",
    grants: grants.map(([permissionKey, scope]) => ({
      permissionKey,
      scope: scope ?? "ORGANIZATION",
    })),
  } as CurrentAccess;
}

describe("campaign access", () => {
  describe("canReadCampaigns", () => {
    it("requires campaign.read at organization scope", () => {
      expect(canReadCampaigns(access(["campaign.read"]))).toBe(true);
    });

    it("accepts a department-scoped reader (e.g. the Marketing Manager)", () => {
      expect(canReadCampaigns(access(["campaign.read", "DEPARTMENT"]))).toBe(
        true,
      );
    });

    it("rejects a caller with no read grant or only a write grant", () => {
      expect(canReadCampaigns(access())).toBe(false);
      expect(canReadCampaigns(access(["campaign.update"]))).toBe(false);
    });
  });

  describe("campaignAbilities", () => {
    it("grants nothing without any campaign key", () => {
      expect(campaignAbilities(access(["campaign.read"]))).toEqual({
        canCreate: false,
        canUpdate: false,
        canTransition: false,
        canAssign: false,
        canReadBudget: false,
        canUpdateBudget: false,
        canManageActivities: false,
        canDelete: false,
      });
    });

    it("maps each key to its own ability", () => {
      const cases: [string, keyof ReturnType<typeof campaignAbilities>][] = [
        ["campaign.create", "canCreate"],
        ["campaign.update", "canUpdate"],
        ["campaign.transition_status", "canTransition"],
        ["campaign.assign", "canAssign"],
        ["campaign.budget.read", "canReadBudget"],
        ["campaign.budget.update", "canUpdateBudget"],
        ["campaign.activity.manage", "canManageActivities"],
        ["campaign.delete", "canDelete"],
      ];

      for (const [key, ability] of cases) {
        const abilities = campaignAbilities(access([key]));
        expect(abilities[ability], key).toBe(true);
        expect(
          Object.entries(abilities)
            .filter(([, granted]) => granted)
            .map(([name]) => name),
          key,
        ).toEqual([ability]);
      }
    });

    it("keeps the budget read and update abilities independent", () => {
      expect(
        campaignAbilities(access(["campaign.budget.update"])),
      ).toMatchObject({ canReadBudget: false, canUpdateBudget: true });
    });

    it("honors a department-scoped grant for every key except delete", () => {
      const abilities = campaignAbilities(
        access(
          ["campaign.create", "DEPARTMENT"],
          ["campaign.update", "DEPARTMENT"],
          ["campaign.delete", "DEPARTMENT"],
        ),
      );

      expect(abilities.canCreate).toBe(true);
      expect(abilities.canUpdate).toBe(true);
      // campaign.delete stays organization-only - no DEPARTMENT-scope grant
      // for it exists in the role catalog.
      expect(abilities.canDelete).toBe(false);
    });

    it("ignores a grant held at a scope the catalog never issues it at", () => {
      const abilities = campaignAbilities(
        access(["campaign.update", "TEAM"], ["campaign.delete", "SELF"]),
      );

      expect(Object.values(abilities).every((granted) => !granted)).toBe(true);
    });
  });
});

describe("per-campaign access (EVE-229)", () => {
  const ALL = [
    "campaign.create",
    "campaign.update",
    "campaign.transition_status",
    "campaign.assign",
    "campaign.budget.read",
    "campaign.budget.update",
    "campaign.activity.manage",
  ];
  const marketingManager: CurrentAccess = {
    userId: "mm",
    role: "DEPARTMENT_MANAGER",
    department: { id: "dept-mkt", name: "Marketing", active: true },
    grants: ALL.map((permissionKey) => ({
      permissionKey,
      scope: "DEPARTMENT",
    })),
    overseenDepartments: [{ id: "dept-promo", name: "Promotion" }],
  };

  it("makes an overseen department's campaign read-only, budget readable", () => {
    expect(
      campaignAbilitiesFor(marketingManager, { departmentId: "dept-promo" }),
    ).toEqual({
      canCreate: false,
      canUpdate: false,
      canTransition: false,
      canAssign: false,
      canReadBudget: true,
      canUpdateBudget: false,
      canManageActivities: false,
      canDelete: false,
    });
  });

  it("leaves the viewer's own campaigns as granted", () => {
    expect(
      campaignAbilitiesFor(marketingManager, { departmentId: "dept-mkt" }),
    ).toEqual(campaignAbilities(marketingManager));
  });

  it("offers approval to Super Admin and Admin only, and Admin nothing else", () => {
    const planned = {
      campaignType: "PROMOTION" as const,
      status: "PLANNED" as const,
    };
    const approved = {
      campaignType: "PROMOTION" as const,
      status: "APPROVED" as const,
    };
    const role = (
      value: NonNullable<CurrentAccess["role"]>,
    ): CurrentAccess => ({
      userId: "u",
      grants: [],
      role: value,
    });
    expect(campaignMovesFor(role("SUPER_ADMIN"), planned)).toEqual([
      "APPROVED",
      "CANCELLED",
    ]);
    expect(campaignMovesFor(role("DEPARTMENT_MANAGER"), planned)).toEqual([
      "CANCELLED",
    ]);
    expect(campaignMovesFor(role("ADMIN"), planned)).toEqual(["APPROVED"]);
    expect(campaignMovesFor(role("ADMIN"), approved)).toEqual([]);
    expect(campaignMovesFor(role("DEPARTMENT_MANAGER"), approved)).toEqual([
      "ACTIVE",
      "CANCELLED",
    ]);
  });
});
