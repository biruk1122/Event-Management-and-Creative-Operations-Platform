"use client";

import Link from "next/link";

import { useCurrentAccess } from "@/features/auth/api/access-queries";

import { readableKinds } from "../lib/workspace-access";

export function WorkspacesNavigation() {
  const access = useCurrentAccess();
  const allowed = access.data != null && readableKinds(access.data).length > 0;
  if (access.isError || !allowed) {
    return null;
  }
  return (
    <nav aria-label="Workspace administration" className="px-5 py-3">
      <Link href="/workspaces" className="text-sm underline underline-offset-4">
        Workspaces
      </Link>
    </nav>
  );
}
