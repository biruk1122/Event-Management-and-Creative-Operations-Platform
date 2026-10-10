import type { Route } from "next";
import { browserApi } from "@/lib/api/browser";
import { safeRedirect } from "../lib/safe-redirect";

/** Recheck grants after login, not a previous account's query cache. */
export async function loginDestination(
  next: string | undefined,
): Promise<Route> {
  if (!next || next === "/") return "/dashboard";
  try {
    const { data } = await browserApi.GET("/api/v1/auth/me/permissions", {
      cache: "no-store",
    });
    const target = safeRedirect(next, data ?? null);
    const path = new URL(target, "https://lela.invalid").pathname;
    const match = /^\/discuss\/(dm|channels)\/([^/]+)$/.exec(path);
    if (match) {
      // A module grant is not membership in a private conversation.
      const { data: conversation } = await browserApi.GET(
        "/api/v1/conversations/{id}",
        {
          params: { path: { id: match[2]! } },
          cache: "no-store",
        },
      );
      if (
        !conversation ||
        (match[1] === "channels") !== (conversation.type === "CHANNEL")
      )
        return "/dashboard";
    }
    return target;
  } catch {
    // Sign-in succeeded; fail closed to the dashboard, whose checks remain authoritative.
    return "/dashboard";
  }
}
