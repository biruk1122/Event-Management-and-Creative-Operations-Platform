"use client";

import { useId } from "react";
import { useQuery } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { connectRealtime as defaultConnectRealtime } from "../api/connect-realtime";
import {
  isRecoverable,
  statusLabel,
  type ConnectRealtime,
  type RealtimeConnectionState,
  type RealtimeConnectionStatus,
} from "../lib/realtime-types";
import { RealtimeStatusBadge } from "./realtime-status-badge";

export const realtimeConnectionKey = ["realtime", "connection"] as const;

const STATUS_ANNOUNCEMENTS: Record<RealtimeConnectionStatus, string> = {
  disabled: "Live updates are turned off.",
  connecting: "Connecting to live updates…",
  connected: "Live updates connected.",
  reconnecting: "Live updates lost connection; reconnecting…",
  denied: "Live updates are unavailable: access denied.",
  error: "Live updates connection failed.",
};

const CONNECTING_STATE: RealtimeConnectionState = {
  status: "connecting",
  detail: null,
  rooms: [],
};

const ERROR_STATE: RealtimeConnectionState = {
  status: "error",
  detail: "We could not reach the live updates service.",
  rooms: [],
};

interface RealtimeStatusPanelProps {
  /** Fixture-backed by default; RTC-05 (EVE-103) supplies the real seam. */
  connect?: ConnectRealtime;
}

export function RealtimeStatusPanel({
  connect = defaultConnectRealtime,
}: RealtimeStatusPanelProps) {
  const headingId = useId();
  const query = useQuery({
    queryKey: realtimeConnectionKey,
    queryFn: connect,
    staleTime: 0,
    retry: false,
  });

  const state: RealtimeConnectionState = query.isSuccess
    ? query.data
    : query.isError
      ? ERROR_STATE
      : CONNECTING_STATE;

  const announcement = STATUS_ANNOUNCEMENTS[state.status];
  const retrying = query.isRefetching;

  return (
    <section
      aria-labelledby={headingId}
      className="border-border space-y-3 rounded-xl border p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 id={headingId} className="text-sm font-medium">
          Live updates
        </h2>
        <RealtimeStatusBadge status={state.status} />
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {state.status === "connecting" ? (
        <p className="text-muted-foreground text-sm">
          Connecting to live updates…
        </p>
      ) : null}

      {state.status === "disabled" ? (
        <p className="text-muted-foreground text-sm">
          Live updates are turned off for this session.
        </p>
      ) : null}

      {state.status === "connected" ? (
        state.rooms.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Connected. No live rooms yet.
          </p>
        ) : (
          <ul className="space-y-1">
            {state.rooms.map((room) => (
              <li key={room.room} className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className="bg-primary size-1.5 shrink-0 rounded-full"
                />
                {room.label}
              </li>
            ))}
          </ul>
        )
      ) : null}

      {state.status === "reconnecting" ? (
        state.rooms.length > 0 ? (
          <ul className="space-y-1">
            {state.rooms.map((room) => (
              <li
                key={room.room}
                className="text-muted-foreground flex items-center gap-2 text-sm"
              >
                <span
                  aria-hidden="true"
                  className="bg-muted-foreground/50 size-1.5 shrink-0 rounded-full"
                />
                {room.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            Reconnecting to live updates…
          </p>
        )
      ) : null}

      {(state.status === "denied" || state.status === "error") &&
      state.detail ? (
        <Alert variant="destructive">
          <AlertTitle>{statusLabel(state.status)}</AlertTitle>
          <AlertDescription>{state.detail}</AlertDescription>
        </Alert>
      ) : null}

      {isRecoverable(state.status) ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={retrying}
          aria-busy={retrying}
          onClick={() => void query.refetch()}
        >
          {retrying ? "Retrying…" : "Retry"}
        </Button>
      ) : null}
    </section>
  );
}
