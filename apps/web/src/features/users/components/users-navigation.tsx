"use client";

import Link from "next/link";

import { useCurrentAccess } from "@/features/auth/api/access-queries";

export function UsersNavigation() {
  const access = useCurrentAccess();
  const allowed =
    access.data?.grants.some(
      (grant) =>
        grant.permissionKey === "user.read" && grant.scope === "ORGANIZATION",
    ) ?? false;
  if (access.isError || !allowed) {
    return null;
  }
  return (
    <nav aria-label="User administration" className="px-5 py-3">
      <Link href="/users" className="text-sm underline underline-offset-4">
        Users
      </Link>
    </nav>
  );
}
