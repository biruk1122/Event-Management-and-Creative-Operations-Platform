/**
 * Pure assignment rules for talent. No database or framework access, so every
 * rule can be tested directly and the server applies the same logic on every
 * submission (the client never supplies conflicts).
 */

export type AssignmentKind = "EVENT" | "PRODUCTION" | "PROMOTION";
export type AssignmentStatus = "ASSIGNED" | "COMPLETED" | "CANCELLED";
export type TalentAvailability =
  "AVAILABLE" | "ASSIGNED" | "UNAVAILABLE" | "INACTIVE";

/** A time span. `endAt` may be null; the span then counts as a single point. */
export interface Span {
  startAt: Date | null;
  endAt: Date | null;
}

export interface OtherAssignment extends Span {
  id: string;
  kind: AssignmentKind;
  title: string;
  status: AssignmentStatus;
}

export interface TalentSchedule extends Span {
  id: string;
  title: string;
}

export type AssignmentConflict =
  | { type: "UNAVAILABLE" }
  | {
      type: "ASSIGNMENT_OVERLAP";
      assignmentKind: AssignmentKind;
      assignmentId: string;
      title: string;
      startAt: string;
      endAt: string | null;
    }
  | {
      type: "SCHEDULE_OVERLAP";
      scheduleId: string;
      title: string;
      startAt: string;
      endAt: string;
    };

export interface ConflictInput {
  window: Span;
  availability: TalentAvailability;
  otherAssignments: readonly OtherAssignment[];
  schedules: readonly TalentSchedule[];
}

/**
 * Inactive talent can never receive a new assignment. This is a hard block,
 * not a conflict, so it cannot be overridden.
 */
export function isAssignmentBlocked(availability: TalentAvailability): boolean {
  return availability === "INACTIVE";
}

/**
 * Two spans overlap when each starts before the other ends. A span without an
 * end is treated as a single moment at its start, and a span without a start
 * cannot be compared at all, so it never produces an overlap.
 */
export function spansOverlap(a: Span, b: Span): boolean {
  if (!a.startAt || !b.startAt) return false;
  const aEnd = a.endAt ?? a.startAt;
  const bEnd = b.endAt ?? b.startAt;
  return a.startAt < bEnd && b.startAt < aEnd;
}

/**
 * Every conflict between a proposed window and the talent's current state.
 * Only ASSIGNED work counts as an overlap: completed and cancelled assignments
 * are history and never block a new one.
 */
export function findConflicts(input: ConflictInput): AssignmentConflict[] {
  const conflicts: AssignmentConflict[] = [];
  if (input.availability === "UNAVAILABLE") {
    conflicts.push({ type: "UNAVAILABLE" });
  }
  for (const other of input.otherAssignments) {
    if (other.status !== "ASSIGNED") continue;
    if (!spansOverlap(input.window, other)) continue;
    conflicts.push({
      type: "ASSIGNMENT_OVERLAP",
      assignmentKind: other.kind,
      assignmentId: other.id,
      title: other.title,
      startAt: other.startAt!.toISOString(),
      endAt: other.endAt?.toISOString() ?? null,
    });
  }
  for (const schedule of input.schedules) {
    if (!spansOverlap(input.window, schedule)) continue;
    conflicts.push({
      type: "SCHEDULE_OVERLAP",
      scheduleId: schedule.id,
      title: schedule.title,
      startAt: schedule.startAt!.toISOString(),
      endAt: (schedule.endAt ?? schedule.startAt)!.toISOString(),
    });
  }
  return conflicts;
}

/**
 * Where an assignment stands at `now`. Completed and cancelled assignments are
 * final; an ASSIGNED one is upcoming until its start, then active until someone
 * completes or cancels it. The end date does not change the status by itself.
 */
export function assignmentPhase(
  status: AssignmentStatus,
  startAt: Date | null,
  now: Date,
): "upcoming" | "active" | "completed" | "cancelled" {
  if (status === "CANCELLED") return "cancelled";
  if (status === "COMPLETED") return "completed";
  return startAt && startAt > now ? "upcoming" : "active";
}

/**
 * Whether a change must be confirmed by a person before it is saved: a conflict
 * exists and the caller did not acknowledge it. Acknowledgement only skips the
 * conflict rule; permissions, scope, inactive talent, duplicates and dates are
 * checked separately and are never overridden.
 */
export function requiresOverrideConfirmation(
  conflicts: readonly AssignmentConflict[],
  acknowledged: boolean,
): boolean {
  return conflicts.length > 0 && !acknowledged;
}
