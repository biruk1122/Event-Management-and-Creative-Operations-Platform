"use client";

import Link from "next/link";

import { useCurrentAccess } from "@/features/auth/api/access-queries";

export function DepartmentsNavigation() {
  const access = useCurrentAccess();
  const allowed =
    access.data?.grants.some(
      (grant) =>
        grant.permissionKey === "department.read" &&
        (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
    ) ?? false;
  if (access.isError || !allowed) {
    return null;
  }
  return (
    <nav aria-label="Department administration" className="px-5 py-3">
      <Link
        href="/departments"
        className="text-sm underline underline-offset-4"
      >
        Departments
      </Link>
    </nav>
  );
}
