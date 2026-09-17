"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useCurrentAccess } from "@/features/auth/api/access-queries";

import { CalendarManager } from "./calendar-manager";

export function CalendarScreen() {
  const access = useCurrentAccess();
  const allowed =
    access.data?.grants.some(
      (grant) => grant.permissionKey === "calendar.read",
    ) ?? false;

  if (access.isPending) return <p role="status">Checking calendar access…</p>;
  if (access.isError)
    return (
      <div role="alert" className="space-y-2">
        <p>{access.error.message}</p>
        <Button variant="outline" onClick={() => void access.refetch()}>
          Check access again
        </Button>
      </div>
    );
  if (access.data === null)
    return (
      <div role="alert" className="space-y-2">
        <p>Your session expired. Sign in again to recover your calendar.</p>
        <Link
          href="/login?next=%2Fcalendar"
          className="text-sm underline underline-offset-4"
        >
          Sign in
        </Link>
      </div>
    );
  if (!allowed)
    return <p role="alert">You do not have access to the calendar.</p>;
  return <CalendarManager key={access.data.userId} />;
}
