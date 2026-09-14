"use client";

import { useId } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { useRealtimeConnection } from "../api/realtime-queries";
import {
  isRecoverable,
  statusLabel,
  type ConnectRealtime,
  type RealtimeConnectionStatus,
} from "../lib/realtime-types";
import { RealtimeStatusBadge } from "./realtime-status-badge";

const STATUS_ANNOUNCEMENTS: Record<RealtimeConnectionStatus, string> = {
  disabled: "Live updates are turned off.",
  connecting: "Connecting to live updates…",
  connected: "Live updates connected.",
  reconnecting: "Live updates lost connection; reconnecting…",
  denied: "Live updates are unavailable: access denied.",
  error: "Live updates connection failed.",
};

interface RealtimeStatusPanelProps {
  /** The real `/realtime` seam by default; tests supply a fake. */
  connect?: ConnectRealtime;
}

export function RealtimeStatusPanel({ connect }: RealtimeStatusPanelProps) {
  const headingId = useId();
  const { state, retrying, retry } = useRealtimeConnection(connect);
  const announcement = STATUS_ANNOUNCEMENTS[state.status];

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
          onClick={retry}
        >
          {retrying ? "Retrying…" : "Retry"}
        </Button>
      ) : null}
    </section>
  );
}
