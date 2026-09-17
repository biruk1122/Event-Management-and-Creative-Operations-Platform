/**
 * Mirrors the `/realtime` gateway's public contract from ADR 0004. Socket.IO
 * has no OpenAPI schema to generate from, so these are hand-authored to match
 * `apps/api/src/realtime/realtime.contracts.ts` rather than derived through
 * `@event-platform/api-client`.
 */
/**
 * `disabled` is not produced by the real `/realtime` seam (`api/
 * connect-realtime.ts`) today - there is no feature flag or config that
 * turns live updates off. Kept in the union, and fully rendered, for a
 * future one rather than removed and re-added later.
 */
export type RealtimeConnectionStatus =
  "disabled" | "connecting" | "connected" | "reconnecting" | "denied" | "error";

export const REALTIME_STATUSES: readonly RealtimeConnectionStatus[] = [
  "disabled",
  "connecting",
  "connected",
  "reconnecting",
  "denied",
  "error",
];

export const REALTIME_STATUS_LABELS: Record<RealtimeConnectionStatus, string> =
  {
    disabled: "Live updates off",
    connecting: "Connecting…",
    connected: "Live",
    reconnecting: "Reconnecting…",
    denied: "Live updates unavailable",
    error: "Connection error",
  };

/** A joined `workspace:<id>` or `user:<id>` room (ADR 0004's room grammar). */
export interface RealtimeRoomSummary {
  room: string;
  label: string;
}

export interface RealtimeConnectionState {
  status: RealtimeConnectionStatus;
  /** Shown for `denied` and `error`; `null` otherwise. */
  detail: string | null;
  /** Rooms currently joined. Only populated once `status` is `connected`. */
  rooms: readonly RealtimeRoomSummary[];
}

/** The human label for a connection status. */
export function statusLabel(status: RealtimeConnectionStatus): string {
  return REALTIME_STATUS_LABELS[status];
}

/** Whether a "Retry" action makes sense for the given status. */
export function isRecoverable(status: RealtimeConnectionStatus): boolean {
  return status === "denied" || status === "error";
}

export type RealtimeConnectionListener = (
  state: RealtimeConnectionState,
) => void;

export type RealtimeUnsubscribe = () => void;

/**
 * A raw server-to-client frame, forwarded exactly as the gateway named and
 * shaped it (ADR 0004 §2's versioned envelope, e.g. `notification.invalidated`
 * on the caller's own `user:<id>` room, which every socket auto-joins on
 * connect - no `room:subscribe` call is needed for it). A feature that only
 * cares about connection status (the badge/panel) passes no listener and
 * never receives this.
 */
export type RealtimeFrameListener = (event: string, payload: unknown) => void;

/**
 * Opens the `/realtime` connection and invokes `listener` with every status
 * transition (connecting, connected, reconnecting after a drop, denied,
 * error) until the returned function closes the connection. A long-lived
 * subscription rather than a one-shot fetch, since a real handshake keeps
 * running and can transition states on its own after the initial call.
 * `onFrame`, when given, is invoked for every named event the socket
 * receives, on top of - not instead of - the connection-status callback.
 */
export type ConnectRealtime = (
  listener: RealtimeConnectionListener,
  onFrame?: RealtimeFrameListener,
) => RealtimeUnsubscribe;
