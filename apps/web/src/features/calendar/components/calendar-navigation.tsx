"use client";

import Link from "next/link";

import { useCurrentAccess } from "@/features/auth/api/access-queries";

export function CalendarNavigation() {
  const access = useCurrentAccess();
  const allowed =
    access.data?.grants.some(
      (grant) => grant.permissionKey === "calendar.read",
    ) ?? false;
  if (access.isError || !allowed) return null;
  return (
    <nav aria-label="Calendar" className="px-5 py-3">
      <Link href="/calendar" className="text-sm underline underline-offset-4">
        Calendar
      </Link>
    </nav>
  );
}
