"use client";

import Link from "next/link";

import { useCurrentAccess } from "@/features/auth/api/access-queries";

export function TodoNavigation() {
  const access = useCurrentAccess();
  const allowed =
    access.data?.grants.some((grant) => grant.permissionKey === "todo.read") ??
    false;
  if (access.isError || !allowed) return null;
  return (
    <nav aria-label="To-Do" className="px-5 py-3">
      <Link href="/todos" className="text-sm underline underline-offset-4">
        To-Do
      </Link>
    </nav>
  );
}
