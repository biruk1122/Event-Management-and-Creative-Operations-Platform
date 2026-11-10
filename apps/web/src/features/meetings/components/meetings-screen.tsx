"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";

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
    <main className="@container mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="space-y-6">
        <header className="border-border from-accent/60 to-card flex items-center gap-4 rounded-2xl border bg-linear-to-r px-6 py-5 shadow-xs">
          <span
            aria-hidden="true"
            className="bg-primary text-primary-foreground flex size-14 shrink-0 items-center justify-center rounded-2xl shadow-sm"
          >
            <CalendarDays className="size-7" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Your schedule, and the meetings you&apos;ve been invited to.
            </p>
          </div>
        </header>
        <MeetingsManager
          key={access.data.userId}
          access={access.data}
          {...(connect ? { connect } : {})}
        />
      </div>
    </main>
  );
}
