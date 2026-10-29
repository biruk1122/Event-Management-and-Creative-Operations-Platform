import { describe, expect, it } from "vitest";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import {
  activeDestination,
  destinations,
  mobileDestinations,
} from "./navigation";

const access = (
  grants: CurrentAccess["grants"],
  department: CurrentAccess["department"] = null,
): CurrentAccess => ({
  userId: "user-1",
  department,
  grants,
});
describe("shell destinations", () => {
  it("does not infer authority from a role or show unfinished pages", () => {
    // "/shared-with-me" is the one destination every authenticated active
    // employee reaches regardless of grants - see its own `add(true, ...)`.
    expect(destinations(access([])).map((i) => i.href)).toEqual([
      "/shared-with-me",
    ]);
    const items = destinations(
      access([{ permissionKey: "role.read", scope: "ORGANIZATION" }]),
    );
    expect(items.map((i) => i.href)).toEqual([
      "/shared-with-me",
      "/settings/roles",
    ]);
  });
  it("matches current project/campaign/talent (organization-only) and event/production (department-scoped) screens", () => {
    const keys = ["event.read", "project.read", "campaign.read", "talent.read"];
    const narrow = destinations(
      access(
        keys.map((permissionKey) => ({ permissionKey, scope: "DEPARTMENT" })),
      ),
    );
    // `project.read` at department scope reaches the Production workspace
    // (PROD-WS) but not general Projects, which stays organization-only.
    // `campaign.read` at department scope does reach Campaigns (e.g. the
    // Marketing Department Manager), matching `canReadCampaigns`.
    expect(narrow.map((i) => i.href)).toEqual([
      "/events",
      "/projects/production",
      "/campaigns",
      "/shared-with-me",
    ]);
    const wide = destinations(
      access(
        keys.map((permissionKey) => ({ permissionKey, scope: "ORGANIZATION" })),
      ),
    );
    expect(wide.map((i) => i.href)).toEqual([
      "/events",
      "/projects",
      "/projects/production",
      "/campaigns",
      "/talent",
      "/shared-with-me",
      "/workspaces",
    ]);
  });
  it("offers personal work without management navigation", () => {
    const items = destinations(
      access(
        [
          "dashboard.read",
          "task.read",
          "calendar.read",
          "conversation.read",
          "report.read",
        ].map((permissionKey) => ({ permissionKey, scope: "SELF" })),
      ),
    );
    expect(items.map((i) => i.label)).toEqual([
      "Dashboard",
      "Reports",
      "Tasks",
      "Shared with Me",
      "Direct messages",
      "Calendar",
    ]);
    expect(mobileDestinations(items).map((i) => i.label)).toEqual([
      "Dashboard",
      "Tasks",
      "Calendar",
      "Discuss",
    ]);
  });
  it("uses channel-only Discuss access without linking denied direct messages", () => {
    const items = destinations(
      access([{ permissionKey: "channel.participate", scope: "SELF" }]),
    );
    expect(mobileDestinations(items)[0]?.href).toBe("/discuss/channels");
  });
  it("preserves department analytics and department administration capabilities", () => {
    const items = destinations(
      access(
        [
          "analytics.department_performance.read",
          "team.read",
          "department.read",
          "user.read",
          "role.read",
        ].map((permissionKey) => ({ permissionKey, scope: "DEPARTMENT" })),
      ),
    );
    expect(items.map((i) => i.href)).toEqual([
      "/analytics",
      "/shared-with-me",
      "/teams",
      "/departments",
    ]);
  });
  it("hides event/expense/supplier/production/campaign/partner nav for the HR & Executive Officer department manager", () => {
    const keys = [
      "event.read",
      "expense.read",
      "supplier.read",
      "project.read",
      "campaign.read",
      "partner.read",
    ];
    const hrGrants = keys.map((permissionKey) => ({
      permissionKey,
      scope: "DEPARTMENT" as const,
    }));
    const hrItems = destinations(
      access(hrGrants, {
        id: "dept-hr",
        name: "HR & Executive Officer",
        active: true,
      }),
    );
    // "/shared-with-me" is the one destination every authenticated active
    // employee reaches regardless of grants - it survives the HR hiding rule.
    expect(hrItems.map((i) => i.href)).toEqual(["/shared-with-me"]);

    // The identical grants, held by a manager of any other department,
    // still reach every one of these screens (the grants themselves are
    // flat across departments - only the HR manager's own nav hides them).
    // Promotion stands in for "any other department" here since Marketing
    // now has its own additional exclusion, tested separately below.
    const promotionItems = destinations(
      access(hrGrants, { id: "dept-promo", name: "Promotion", active: true }),
    );
    expect(promotionItems.map((i) => i.href)).toEqual([
      "/events",
      "/expenses",
      "/suppliers",
      "/projects/production",
      "/campaigns",
      "/partners",
      "/shared-with-me",
    ]);

    // A deactivated HR department falls back to the generic grants too -
    // the hiding rule only applies to an active HR manager.
    const inactiveHr = destinations(
      access(hrGrants, {
        id: "dept-hr",
        name: "HR & Executive Officer",
        active: false,
      }),
    );
    expect(inactiveHr.map((i) => i.href)).toEqual([
      "/events",
      "/expenses",
      "/suppliers",
      "/projects/production",
      "/campaigns",
      "/partners",
      "/shared-with-me",
    ]);
  });

  it("hides Production from the Marketing department manager's own nav", () => {
    const keys = [
      "event.read",
      "project.read",
      "campaign.read",
      "partner.read",
    ];
    const marketingGrants = keys.map((permissionKey) => ({
      permissionKey,
      scope: "DEPARTMENT" as const,
    }));
    const items = destinations(
      access(marketingGrants, {
        id: "dept-mkt",
        name: "Marketing",
        active: true,
      }),
    );
    // Production is gone; everything else the Marketing Manager actually
    // works with (Events, the Marketing Workspace, Campaigns, Partners)
    // stays reachable.
    expect(items.map((i) => i.href)).toEqual([
      "/events",
      "/marketing",
      "/campaigns",
      "/partners",
      "/shared-with-me",
    ]);

    // A deactivated Marketing department falls back to the generic grants,
    // Production included - the hiding rule only applies to an active
    // Marketing manager, matching the existing HR precedent.
    const inactiveMarketing = destinations(
      access(marketingGrants, {
        id: "dept-mkt",
        name: "Marketing",
        active: false,
      }),
    );
    expect(inactiveMarketing.map((i) => i.href)).toEqual([
      "/events",
      "/projects/production",
      "/campaigns",
      "/partners",
      "/shared-with-me",
    ]);
  });

  it("selects only the most specific destination and respects path boundaries", () => {
    const items = destinations(
      access([{ permissionKey: "project.read", scope: "ORGANIZATION" }]),
    );
    expect(activeDestination(items, "/projects/production")?.label).toBe(
      "Production",
    );
    expect(activeDestination(items, "/projects/no-such-record")?.label).toBe(
      "Projects",
    );
    expect(activeDestination(items, "/projects-unknown")).toBeUndefined();
  });
});
