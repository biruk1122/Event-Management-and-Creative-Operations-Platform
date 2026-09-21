import { describe, expect, it } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { campaignAbilities, canReadCampaigns } from "./campaign-access";

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

    it("rejects a department-scoped reader", () => {
      expect(canReadCampaigns(access(["campaign.read", "DEPARTMENT"]))).toBe(
        false,
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

    it("ignores a grant held at any scope other than organization", () => {
      const abilities = campaignAbilities(
        access(
          ["campaign.create", "DEPARTMENT"],
          ["campaign.update", "TEAM"],
          ["campaign.delete", "SELF"],
        ),
      );

      expect(Object.values(abilities).every((granted) => !granted)).toBe(true);
    });
  });
});
