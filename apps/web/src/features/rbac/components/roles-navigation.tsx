"use client";

import Link from "next/link";
import {
  canManageRoles,
  useCurrentAccess,
} from "@/features/auth/api/access-queries";

export function RolesNavigation() {
  const access = useCurrentAccess();
  if (access.isError || !canManageRoles(access.data, "role.read")) return null;
  return (
    <nav aria-label="Account" className="px-5 py-3">
      <Link
        href="/settings/roles"
        className="text-sm underline underline-offset-4"
      >
        Roles and permissions
      </Link>
    </nav>
  );
}
