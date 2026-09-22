import { describe, expect, it } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { canReadTalent, talentAbilities } from "./talent-access";

function access(...grants: [string, string?][]): CurrentAccess {
  return {
    userId: "u1",
    grants: grants.map(([permissionKey, scope]) => ({
      permissionKey,
      scope: scope ?? "ORGANIZATION",
    })),
  } as CurrentAccess;
}

describe("talent access", () => {
  describe("canReadTalent", () => {
    it("requires talent.read at organization scope", () => {
      expect(canReadTalent(access(["talent.read"]))).toBe(true);
    });

    it("rejects a department-scoped reader", () => {
      expect(canReadTalent(access(["talent.read", "DEPARTMENT"]))).toBe(false);
    });

    it("rejects a caller with no read grant or only a write grant", () => {
      expect(canReadTalent(access())).toBe(false);
      expect(canReadTalent(access(["talent.update"]))).toBe(false);
    });
  });

  describe("talentAbilities", () => {
    it("grants nothing without any talent key", () => {
      expect(talentAbilities(access(["talent.read"]))).toEqual({
        canCreate: false,
        canUpdate: false,
        canTransition: false,
        canAssign: false,
        canManageActivities: false,
      });
    });

    it("maps each key to its own ability", () => {
      const cases: [string, keyof ReturnType<typeof talentAbilities>][] = [
        ["talent.create", "canCreate"],
        ["talent.update", "canUpdate"],
        ["talent.transition_status", "canTransition"],
        ["talent.assign", "canAssign"],
        ["talent.manage_activities", "canManageActivities"],
      ];

      for (const [key, ability] of cases) {
        const abilities = talentAbilities(access([key]));
        expect(abilities[ability], key).toBe(true);
        expect(
          Object.entries(abilities)
            .filter(([, granted]) => granted)
            .map(([name]) => name),
          key,
        ).toEqual([ability]);
      }
    });

    it("ignores a grant held at any scope other than organization", () => {
      const abilities = talentAbilities(
        access(
          ["talent.create", "DEPARTMENT"],
          ["talent.update", "TEAM"],
          ["talent.assign", "SELF"],
        ),
      );

      expect(Object.values(abilities).every((granted) => !granted)).toBe(true);
    });

    // Social links use `talent.update`, not `talent.manage_activities` - only
    // schedules use that key. This is a real divergence in TalentController's
    // RBAC mapping, not a naming mistake.
    it("keeps social-link management on canUpdate, not canManageActivities", () => {
      const withUpdateOnly = talentAbilities(access(["talent.update"]));
      expect(withUpdateOnly.canUpdate).toBe(true);
      expect(withUpdateOnly.canManageActivities).toBe(false);
    });
  });
});
