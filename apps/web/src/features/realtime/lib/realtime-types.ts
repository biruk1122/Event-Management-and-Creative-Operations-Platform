/**
 * Mirrors the `/realtime` gateway's public contract from ADR 0004. Socket.IO
 * has no OpenAPI schema to generate from, so these are hand-authored to match
 * `apps/api/src/realtime/realtime.contracts.ts` rather than derived through
 * `@event-platform/api-client`.
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

/** Attempts the `/realtime` handshake and reports the resulting state. */
export type ConnectRealtime = () => Promise<RealtimeConnectionState>;
