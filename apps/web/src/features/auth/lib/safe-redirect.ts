import type { Route } from "next";
import type { CurrentAccess } from "../api/access-queries";
import { destinations } from "@/components/shell/navigation";
import { canEnter } from "@/features/dashboards/lib/dashboard-presentation";

/** NAV-08 / EVE-218: shipped routes with current grants, never arbitrary paths. */
export function safeRedirect(
  next: string | undefined,
  access: CurrentAccess | null,
): Route {
  if (!next || !access || !next.startsWith("/") || next.startsWith("//"))
    return "/dashboard";
  try {
    // Reject malformed encoding, controls and backslashes before URL normalization.
    const decoded = decodeURIComponent(next);
    if (
      next.trim() !== next ||
      decoded.includes("\\") ||
      Array.from(decoded).some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      return "/dashboard";
    const url = new URL(next, "https://lela.invalid");
    const rawPath = next.split(/[?#]/, 1)[0];
    if (
      url.origin !== "https://lela.invalid" ||
      url.pathname !== rawPath ||
      url.pathname.includes("%") ||
      url.pathname.includes("//")
    )
      return "/dashboard";
    const path = url.pathname;
    if (path === "/") return "/dashboard";
    const allowed = destinations(access).some((item) => item.href === path);
    const notification =
      path === "/notifications" &&
      access.grants.some(
        (grant) => grant.permissionKey === "notification.read",
      );
    const conversation =
      /^\/discuss\/(dm|channels)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        path,
      ) &&
      destinations(access).some((item) => path.startsWith(`${item.href}/`));
    if (!allowed && !notification && !conversation) return "/dashboard";
    if (path === "/dashboard") {
      const audience = url.searchParams.get("audience");
      if (
        (audience === "management" || audience === "employee") &&
        !canEnter(access, audience)
      )
        return "/dashboard";
    }
    return next as Route;
  } catch {
    return "/dashboard";
  }
}
