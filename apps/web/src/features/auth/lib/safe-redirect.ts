import type { Route } from "next";

/**
 * Constrain a post-sign-in redirect target to a path inside this application.
 * Off-site URLs, protocol-relative (`//host`) and backslash (`/\host`) targets,
 * and anything not starting with a single slash fall back to the home route.
 * (EVE-35 navigation decision NAV-08.)
 */
export function safeRedirect(next: string | undefined): Route {
  if (
    typeof next === "string" &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\")
  ) {
    return next as Route;
  }

  return "/";
}
