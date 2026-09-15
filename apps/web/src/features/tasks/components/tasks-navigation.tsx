"use client";

import Link from "next/link";

import { useCurrentAccess } from "@/features/auth/api/access-queries";

export function TasksNavigation() {
  const access = useCurrentAccess();
  const allowed =
    access.data?.grants.some((grant) => grant.permissionKey === "task.read") ??
    false;

  if (access.isError || !allowed) return null;

  return (
    <nav aria-label="Task management" className="px-5 py-3">
      <Link href="/tasks" className="text-sm underline underline-offset-4">
        Tasks
      </Link>
    </nav>
  );
}
