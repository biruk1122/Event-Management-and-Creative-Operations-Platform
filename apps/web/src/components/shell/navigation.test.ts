import { describe, expect, it } from "vitest";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import {
  activeDestination,
  destinations,
  mobileDestinations,
} from "./navigation";

const access = (grants: CurrentAccess["grants"]): CurrentAccess => ({
  userId: "user-1",
  grants,
});
describe("shell destinations", () => {
  it("does not infer authority from a role or show unfinished pages", () => {
    expect(destinations(access([]))).toEqual([]);
    const items = destinations(
      access([{ permissionKey: "role.read", scope: "ORGANIZATION" }]),
    );
    expect(items.map((i) => i.href)).toEqual(["/settings/roles"]);
  });
  it("matches current organization-only event/project/campaign/talent screens", () => {
    const keys = ["event.read", "project.read", "campaign.read", "talent.read"];
    const narrow = destinations(
      access(
        keys.map((permissionKey) => ({ permissionKey, scope: "DEPARTMENT" })),
      ),
    );
    expect(narrow.map((i) => i.href)).toEqual([]);
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
      "/teams",
      "/departments",
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
