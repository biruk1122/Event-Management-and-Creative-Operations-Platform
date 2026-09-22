"use client";

import Link from "next/link";

import { useCurrentAccess } from "@/features/auth/api/access-queries";

import { canReadTalent } from "../lib/talent-access";

export function TalentNavigation() {
  const access = useCurrentAccess();
  const allowed = access.data != null && canReadTalent(access.data);
  if (access.isError || !allowed) {
    return null;
  }
  return (
    <nav aria-label="Talent management" className="px-5 py-3">
      <Link href="/talent" className="text-sm underline underline-offset-4">
        Talent
      </Link>
    </nav>
  );
}
