"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useCurrentAccess } from "@/features/auth/api/access-queries";
import type { ConnectRealtime } from "@/features/realtime";

import { MeetingsManager } from "./meetings-manager";

export interface MeetingsScreenProps {
  connect?: ConnectRealtime;
}

export function MeetingsScreen({ connect }: MeetingsScreenProps = {}) {
  const access = useCurrentAccess();
  const allowed =
    access.data?.grants.some(
      (grant) => grant.permissionKey === "meeting.read",
    ) ?? false;

  if (access.isPending) return <p role="status">Checking meeting access…</p>;
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
        <p>Your session expired. Sign in again to recover your meetings.</p>
        <Link
          href="/login?next=%2Fmeetings"
          className="text-sm underline underline-offset-4"
        >
          Sign in
        </Link>
      </div>
    );
  if (!allowed)
    return <p role="alert">You do not have access to these meetings.</p>;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header>
        <p className="text-muted-foreground text-sm">Meetings</p>
        <h1 className="text-2xl font-semibold tracking-tight">Your schedule</h1>
      </header>
      <MeetingsManager
        key={access.data.userId}
        access={access.data}
        {...(connect ? { connect } : {})}
      />
    </main>
  );
}
