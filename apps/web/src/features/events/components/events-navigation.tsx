"use client";

import Link from "next/link";

import { useCurrentAccess } from "@/features/auth/api/access-queries";

import { canReadEvents } from "../lib/event-access";

export function EventsNavigation() {
  const access = useCurrentAccess();
  const allowed = access.data != null && canReadEvents(access.data);
  if (access.isError || !allowed) {
    return null;
  }
  return (
    <nav aria-label="Event management" className="px-5 py-3">
      <Link href="/events" className="text-sm underline underline-offset-4">
        Events
      </Link>
    </nav>
  );
}
