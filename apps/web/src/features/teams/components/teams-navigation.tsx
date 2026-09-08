"use client";

import Link from "next/link";

import { useCurrentAccess } from "@/features/auth/api/access-queries";

export function TeamsNavigation() {
  const access = useCurrentAccess();
  const allowed =
    access.data?.grants.some(
      (grant) =>
        grant.permissionKey === "team.read" &&
        (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
    ) ?? false;
  if (access.isError || !allowed) {
    return null;
  }
  return (
    <nav aria-label="Team administration" className="px-5 py-3">
      <Link href="/teams" className="text-sm underline underline-offset-4">
        Teams
      </Link>
    </nav>
  );
}
