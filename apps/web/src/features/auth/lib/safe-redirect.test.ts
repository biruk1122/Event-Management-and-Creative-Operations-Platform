import { describe, expect, it } from "vitest";
import type { CurrentAccess } from "../api/access-queries";
import { safeRedirect } from "./safe-redirect";

const access: CurrentAccess = {
  userId: "member",
  grants: [
    "dashboard.read",
    "calendar.read",
    "report.read",
    "conversation.read",
  ].map((permissionKey) => ({ permissionKey, scope: "SELF" })),
};
describe("NAV-08 safeRedirect", () => {
  it("preserves a permitted shipped route including query/hash state", () => {
    expect(
      safeRedirect("/calendar?view=week&date=2026-10-09#schedule", access),
    ).toBe("/calendar?view=week&date=2026-10-09#schedule");
    expect(safeRedirect("/reports?period=weekly&page=2", access)).toBe(
      "/reports?period=weekly&page=2",
    );
    expect(safeRedirect("/reports?search=hello%20world", access)).toBe(
      "/reports?search=hello%20world",
    );
  });
  it.each([
    undefined,
    "",
    "/",
    "calendar",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/%2f%2fevil.example",
    "/%5cevil.example",
    "/calendar%0a",
    "/calendar\n",
    "/calendar%",
    "/calendar/../users",
    "/calendar//",
    "/calendar/",
    "/login",
    "/login?next=/login",
    "/api/health/backend",
    "/account",
    "/unknown",
    "/events/42/tasks",
    "/users",
    "/analytics",
    "/dashboard?audience=management",
    "/discuss/dm/not-a-uuid",
    "/calendar?view=%ZZ",
  ])("falls back for unsafe, unshipped or denied next %s", (next) => {
    expect(safeRedirect(next, access)).toBe("/dashboard");
  });
  it("does not use a previous account's permissions", () => {
    expect(safeRedirect("/reports", null)).toBe("/dashboard");
    expect(safeRedirect("/calendar", { userId: "other", grants: [] })).toBe(
      "/dashboard",
    );
  });
  it("uses scope-aware shell permissions, not role names", () => {
    expect(
      safeRedirect("/users", {
        userId: "manager",
        grants: [{ permissionKey: "user.read", scope: "DEPARTMENT" }],
      }),
    ).toBe("/dashboard");
    expect(
      safeRedirect("/users?page=2", {
        userId: "admin",
        grants: [{ permissionKey: "user.read", scope: "ORGANIZATION" }],
      }),
    ).toBe("/users?page=2");
  });
});
