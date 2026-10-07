"use client";
import Link from "next/link";
import { useCurrentAccess } from "@/features/auth/api/access-queries";
import { canEnter } from "../lib/dashboard-presentation";
export function DashboardNavigation() {
  const access = useCurrentAccess();
  if (
    access.isFetching ||
    access.isPaused ||
    access.isError ||
    !access.data ||
    (!canEnter(access.data, "employee") && !canEnter(access.data, "management"))
  )
    return null;
  return (
    <nav aria-label="Dashboards" className="px-5 py-3">
      <Link href="/dashboard" className="text-sm underline underline-offset-4">
        Dashboard
      </Link>
    </nav>
  );
}
