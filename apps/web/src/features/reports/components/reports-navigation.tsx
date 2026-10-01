"use client";

import Link from "next/link";

import { useCurrentAccess } from "@/features/auth/api/access-queries";

export function ReportsNavigation() {
  const access = useCurrentAccess();
  const allowed = access.data?.grants.some(
    (grant) => grant.permissionKey === "report.read",
  );
  if (access.isError || !allowed) return null;

  return (
    <nav aria-label="Reports" className="px-5 py-3">
      <Link href="/reports" className="text-sm underline underline-offset-4">
        Reports
      </Link>
    </nav>
  );
}
