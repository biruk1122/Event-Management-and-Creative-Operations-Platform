"use client";

import Link from "next/link";

import { useCurrentAccess } from "@/features/auth/api/access-queries";

export function MeetingsNavigation() {
  const access = useCurrentAccess();
  const allowed =
    access.data?.grants.some((grant) => grant.permissionKey === "meeting.read") ?? false;
  if (access.isError || !allowed) return null;
  return <nav aria-label="Meetings" className="px-5 py-3"><Link href="/meetings" className="text-sm underline underline-offset-4">Meetings</Link></nav>;
}
