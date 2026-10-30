"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useCurrentAccess } from "@/features/auth/api/access-queries";

import { leaveAbilities } from "../lib/leave-access";
import { LeaveManager } from "./leave-manager";

export function LeaveScreen() {
  const access = useCurrentAccess();

  if (access.isPending) return <p role="status">Checking leave access…</p>;
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
        <p>Your session expired. Sign in again to see your leave.</p>
        <Link
          href="/login?next=%2Fleave"
          className="text-sm underline underline-offset-4"
        >
          Sign in
        </Link>
      </div>
    );
  if (!leaveAbilities(access.data).canRequestLeave)
    return <p role="alert">You do not have access to leave requests.</p>;
  return <LeaveManager key={access.data.userId} access={access.data} />;
}
