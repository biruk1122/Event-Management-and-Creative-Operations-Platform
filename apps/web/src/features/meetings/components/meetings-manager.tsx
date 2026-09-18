"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import {
  useRealtimeConnection,
  type ConnectRealtime,
} from "@/features/realtime";

import { MeetingsRequestError, type Meeting } from "../api/meetings-gateway";
import {
  meetingsKeys,
  useMeetingMutations,
  useMeetings,
} from "../api/meetings-queries";

const LIVE_EVENT = "notification.invalidated";

function personName(person: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}) {
  const name = [person.firstName, person.lastName].filter(Boolean).join(" ");
  return name || person.email;
}

function formatWhen(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export interface MeetingsManagerProps {
  access: CurrentAccess;
  connect?: ConnectRealtime;
}

/** REST-backed meeting list and participant response surface. */
export function MeetingsManager({ access, connect }: MeetingsManagerProps) {
  const client = useQueryClient();
  const keys = meetingsKeys(access);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const reconcile = useCallback(() => {
    void client.invalidateQueries({ queryKey: keys.all });
  }, [client, keys.all]);

  // Meeting invitations are delivered through the authorized per-user
  // notification invalidation. Its payload is advisory; a frame only causes
  // the REST query to refetch (ADR 0004).
  const connection = useRealtimeConnection(connect, (event) => {
    if (event === LIVE_EVENT) reconcile();
  });
  const everConnected = useRef(false);
  useEffect(() => {
    if (connection.state.status === "connected") {
      if (everConnected.current) reconcile();
      everConnected.current = true;
    }
  }, [connection.state.status, reconcile]);

  const feed = useMeetings(access);
  const mutations = useMeetingMutations(access);
  useEffect(() => {
    if (
      feed.error instanceof MeetingsRequestError &&
      (feed.error.status === 401 || feed.error.status === 403)
    ) {
      void client.invalidateQueries({ queryKey: accessKey });
    }
  }, [feed.error, client]);

  const meetings = useMemo(
    () => feed.data?.pages.flatMap((page) => page.items) ?? [],
    [feed.data],
  );
  const selected = useMemo<Meeting | null>(
    () =>
      meetings.find((meeting) => meeting.id === selectedId) ??
      meetings[0] ??
      null,
    [meetings, selectedId],
  );
  const participant = selected?.participants.find(
    (item) => item.id === access.userId,
  );
  const canRespond =
    participant?.response === "PENDING" &&
    selected?.status === "SCHEDULED" &&
    access.grants.some((grant) => grant.permissionKey === "meeting.respond");

  async function respond(response: "ACCEPTED" | "DECLINED") {
    if (!selected) return;
    setNotice(null);
    try {
      await mutations.respond.mutateAsync({ id: selected.id, response });
      setNotice(`Your response is marked ${response.toLowerCase()}.`);
    } catch (error) {
      setNotice(
        error instanceof MeetingsRequestError
          ? error.message
          : "We could not update your response. Try again.",
      );
    }
  }

  if (feed.isPending) return <p role="status">Loading your meetings…</p>;
  if (feed.isError) {
    return (
      <div role="alert" className="space-y-2">
        <p>
          {feed.error instanceof MeetingsRequestError
            ? feed.error.message
            : "We could not load your meetings. Try again."}
        </p>
        <Button variant="outline" onClick={() => void feed.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {connection.state.status === "reconnecting" ? (
        <p role="status" className="text-muted-foreground text-sm">
          Reconnecting…
        </p>
      ) : null}
      {connection.state.status === "denied" ? (
        <p role="status" className="text-muted-foreground text-sm">
          Live updates are unavailable. Refresh to see changes made elsewhere.
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-muted-foreground text-sm">
          {notice}
        </p>
      ) : null}
      {meetings.length === 0 ? (
        <section
          aria-labelledby="meeting-list-title"
          className="rounded-lg border p-4 sm:p-6"
        >
          <h2 id="meeting-list-title" className="text-lg font-medium">
            No meetings to show
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            When you are invited to a meeting, it will appear here and in your
            calendar.
          </p>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.2fr)]">
          <section aria-label="Meetings" className="space-y-2">
            {meetings.map((meeting) => (
              <Button
                key={meeting.id}
                variant="outline"
                className="h-auto w-full justify-start p-3 text-left"
                onClick={() => setSelectedId(meeting.id)}
                aria-pressed={selected?.id === meeting.id}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {meeting.title}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {formatWhen(meeting.startAt)}
                  </span>
                </span>
              </Button>
            ))}
            {feed.hasNextPage ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={feed.isFetchingNextPage}
                onClick={() => void feed.fetchNextPage()}
              >
                {feed.isFetchingNextPage ? "Loading…" : "Load more meetings"}
              </Button>
            ) : null}
          </section>
          {selected ? (
            <MeetingDetail
              meeting={selected}
              participant={participant ?? null}
              canRespond={canRespond}
              submitting={mutations.respond.isPending}
              onRespond={respond}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function MeetingDetail({
  meeting,
  participant,
  canRespond,
  submitting,
  onRespond,
}: {
  meeting: Meeting;
  participant: Meeting["participants"][number] | null;
  canRespond: boolean;
  submitting: boolean;
  onRespond: (response: "ACCEPTED" | "DECLINED") => void;
}) {
  return (
    <section
      aria-labelledby="meeting-detail-title"
      className="rounded-lg border p-4 sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="meeting-detail-title" className="text-lg font-medium">
            {meeting.title}
          </h2>
          <p className="text-muted-foreground text-sm">
            {formatWhen(meeting.startAt)} – {formatWhen(meeting.endAt)}
          </p>
        </div>
        <Badge>{meeting.status}</Badge>
      </div>
      {meeting.description ? (
        <p className="mt-4 text-sm">{meeting.description}</p>
      ) : null}
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Organizer</dt>
          <dd>{personName(meeting.organizer)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Format</dt>
          <dd>{meeting.type}</dd>
        </div>
        {meeting.location ? (
          <div>
            <dt className="text-muted-foreground">Location</dt>
            <dd>{meeting.location}</dd>
          </div>
        ) : null}
        {meeting.onlineLink ? (
          <div>
            <dt className="text-muted-foreground">Online link</dt>
            <dd>
              <a
                className="underline underline-offset-4"
                href={meeting.onlineLink}
              >
                Join meeting
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-5">
        <h3 className="font-medium">Participants</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {meeting.participants.map((item) => (
            <li key={item.id} className="flex justify-between gap-2">
              <span>{personName(item)}</span>
              <span className="text-muted-foreground">{item.response}</span>
            </li>
          ))}
        </ul>
      </div>
      {participant ? (
        <div className="mt-5">
          <p className="text-sm font-medium">
            Your response: {participant.response}
          </p>
          {canRespond ? (
            <div
              className="mt-3 flex gap-2"
              role="group"
              aria-label="Respond to meeting invitation"
            >
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => void onRespond("ACCEPTED")}
              >
                Accept
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => void onRespond("DECLINED")}
              >
                Decline
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
