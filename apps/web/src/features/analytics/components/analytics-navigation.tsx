"use client";
import Link from "next/link";
import { useCurrentAccess } from "@/features/auth/api/access-queries";
import { analyticsAbilities } from "../lib/analytics-presentation";
export function AnalyticsNavigation() {
  const access = useCurrentAccess();
  if (
    access.isError ||
    access.isFetching ||
    !access.data ||
    !Object.values(analyticsAbilities(access.data)).some(Boolean)
  )
    return null;
  return (
    <nav aria-label="Analytics" className="px-5 py-3">
      <Link href="/analytics" className="text-sm underline underline-offset-4">
        Analytics
      </Link>
    </nav>
  );
}
