"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { listEventMeetings } from "@/features/meetings/api/meetings-gateway";
import { formatInZone } from "@/lib/app-timezone";

import { eventKeys } from "../../api/events-queries";
import { useEventWorkspace } from "./event-workspace-shell";

const CARD = "border-border bg-card rounded-2xl border p-6 shadow-sm";

function when(startAt: string): string {
  return formatInZone(startAt, { dateStyle: "medium", timeStyle: "short" });
}

/** Meetings linked to this event's workspace. The meetings module applies each caller's visibility. */
export function EventMeetingsTab() {
  const { event, access } = useEventWorkspace();
  const keys = eventKeys(access);

  const meetings = useQuery({
    queryKey: keys.eventMeetings(event.id),
    queryFn: ({ signal }) => listEventMeetings(event.workspaceId, signal),
  });

  return (
    <section className={CARD} aria-labelledby="event-meetings-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="event-meetings-heading" className="text-lg font-semibold">
            Meetings
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Meetings linked to this event. Schedule and join them on the
            Meetings page.
          </p>
        </div>
        <Link href="/meetings" className="text-sm font-medium hover:underline">
          Open Meetings
        </Link>
      </div>

      <div className="mt-6">
        {meetings.isPending ? (
          <p className="text-muted-foreground text-sm">Loading meetings…</p>
        ) : meetings.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Meetings could not be loaded. Try again.</AlertTitle>
          </Alert>
        ) : meetings.data.length === 0 ? (
          <div className="border-border rounded-xl border border-dashed p-8 text-center">
            <p className="font-medium">No meetings yet</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Meetings linked to this event appear here.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3">
            {meetings.data.map((meeting) => (
              <li
                key={meeting.id}
                className="border-border flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{meeting.title}</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {when(meeting.startAt)}
                  </p>
                </div>
                <Badge variant="outline">{meeting.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
