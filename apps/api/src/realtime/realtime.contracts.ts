/**
 * The `/realtime` public contract, fixed by ADR 0004
 * (`docs/decisions/0004-real-time-contracts-and-persistence-boundaries.md`).
 * Every server-to-client frame and every client-to-server command uses these
 * shapes; no producer module invents its own envelope or ack format.
 */

/** A room name, always `<scope>:<id>`. Only the scopes this module knows about. */
export type RoomScope = "user" | "workspace";

export function roomName(scope: RoomScope, id: string): string {
  return `${scope}:${id}`;
}

/**
 * The versioned envelope every server-to-client frame uses (ADR 0004 §2).
 * `payload` is never the internal domain event's raw shape - each producer
 * defines and owns an explicit, allow-listed shape per `(event, version)`.
 */
export interface RealtimeEnvelope<TPayload = unknown> {
  event: string;
  version: number;
  eventId: string;
  occurredAt: string;
  room: string;
  payload: TPayload;
}

/** The acknowledgement shape every command handler returns (ADR 0004 §3). */
export type RealtimeAck<TData = unknown> =
  { ok: true; data: TData } | { ok: false; error: RealtimeAckError };

export interface RealtimeAckError {
  code: string;
  message: string;
}

/** `room:subscribe` / `room:unsubscribe` command payload (ADR 0004 §4). */
export interface RoomCommand {
  version: number;
  room: string;
}
