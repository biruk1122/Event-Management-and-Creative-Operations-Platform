import { EventStatus } from "../generated/prisma/client.js";

/**
 * The approved event lifecycle graph (SRS 5.5, product vocabulary):
 *
 *   Planning    -> Ready | In Progress | Cancelled
 *   Ready       -> In Progress | Cancelled
 *   In Progress -> Completed | Cancelled
 *   Completed   -> (terminal)
 *   Cancelled   -> (terminal)
 *
 * This module enforces the shape of the graph only. Whether `READY` has entry
 * criteria and is mandatory, who may make each move, and whether a terminal
 * event can be reopened are open in OD-05 and are not decided here; every move
 * is gated by the single `event.transition_status` permission.
 */
const ALLOWED_TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  [EventStatus.PLANNING]: [
    EventStatus.READY,
    EventStatus.IN_PROGRESS,
    EventStatus.CANCELLED,
  ],
  [EventStatus.READY]: [EventStatus.IN_PROGRESS, EventStatus.CANCELLED],
  [EventStatus.IN_PROGRESS]: [EventStatus.COMPLETED, EventStatus.CANCELLED],
  [EventStatus.COMPLETED]: [],
  [EventStatus.CANCELLED]: [],
};

export function canTransition(from: EventStatus, to: EventStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
