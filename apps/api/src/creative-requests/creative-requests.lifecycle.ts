import {
  CreativeRequestFileKind,
  CreativeRequestStatus,
} from "../generated/prisma/client.js";

/**
 * Which side of a creative request may make each move (EVE-232):
 * - REQUESTER: the requesting department (Promotion), `creative_request.create`
 *   to cancel, `creative_request.review` to approve or ask for changes.
 * - RESPONDER: the target department (Production), `creative_request.respond`.
 */
export type CreativeRequestSide = "REQUESTER" | "RESPONDER";

export interface CreativeRequestMove {
  to: CreativeRequestStatus;
  side: CreativeRequestSide;
  permissionKey:
    | "creative_request.create"
    | "creative_request.respond"
    | "creative_request.review";
}

const MOVES: Readonly<
  Record<CreativeRequestStatus, readonly CreativeRequestMove[]>
> = {
  [CreativeRequestStatus.SUBMITTED]: [
    {
      to: CreativeRequestStatus.ACCEPTED,
      side: "RESPONDER",
      permissionKey: "creative_request.respond",
    },
    {
      to: CreativeRequestStatus.DECLINED,
      side: "RESPONDER",
      permissionKey: "creative_request.respond",
    },
    {
      to: CreativeRequestStatus.CANCELLED,
      side: "REQUESTER",
      permissionKey: "creative_request.create",
    },
  ],
  [CreativeRequestStatus.ACCEPTED]: [
    {
      to: CreativeRequestStatus.IN_PROGRESS,
      side: "RESPONDER",
      permissionKey: "creative_request.respond",
    },
  ],
  [CreativeRequestStatus.IN_PROGRESS]: [
    {
      to: CreativeRequestStatus.DELIVERED,
      side: "RESPONDER",
      permissionKey: "creative_request.respond",
    },
  ],
  [CreativeRequestStatus.DELIVERED]: [
    {
      to: CreativeRequestStatus.APPROVED,
      side: "REQUESTER",
      permissionKey: "creative_request.review",
    },
    {
      to: CreativeRequestStatus.CHANGES_REQUESTED,
      side: "REQUESTER",
      permissionKey: "creative_request.review",
    },
  ],
  [CreativeRequestStatus.CHANGES_REQUESTED]: [
    {
      to: CreativeRequestStatus.IN_PROGRESS,
      side: "RESPONDER",
      permissionKey: "creative_request.respond",
    },
  ],
  [CreativeRequestStatus.DECLINED]: [],
  [CreativeRequestStatus.APPROVED]: [],
  [CreativeRequestStatus.CANCELLED]: [],
};

/** The move from `from` to `to`, or null when the lifecycle has none. */
export function creativeRequestMove(
  from: CreativeRequestStatus,
  to: CreativeRequestStatus,
): CreativeRequestMove | null {
  return MOVES[from].find((move) => move.to === to) ?? null;
}

/** The moves out of `from`, for the response's `allowedMoves` hint. */
export function creativeRequestMovesFrom(
  from: CreativeRequestStatus,
): readonly CreativeRequestMove[] {
  return MOVES[from];
}

export function isFinalCreativeRequestStatus(
  status: CreativeRequestStatus,
): boolean {
  return MOVES[status].length === 0;
}

/**
 * When each kind of file may be added. References come from the requester
 * until the work is approved; deliverables come from the responder while the
 * work is open.
 */
export function canAttachCreativeRequestFile(
  status: CreativeRequestStatus,
  kind: CreativeRequestFileKind,
): boolean {
  if (kind === CreativeRequestFileKind.REFERENCE) {
    return !isFinalCreativeRequestStatus(status);
  }
  return (
    status === CreativeRequestStatus.ACCEPTED ||
    status === CreativeRequestStatus.IN_PROGRESS ||
    status === CreativeRequestStatus.CHANGES_REQUESTED
  );
}

/** The side that adds each kind of file. */
export function sideForFileKind(
  kind: CreativeRequestFileKind,
): CreativeRequestSide {
  return kind === CreativeRequestFileKind.REFERENCE ? "REQUESTER" : "RESPONDER";
}
