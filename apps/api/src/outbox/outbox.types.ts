import type { OutboxActorKind, Prisma } from "../generated/prisma/client.js";

/**
 * The durable domain events this API instance can produce (ADR 0001 §1).
 * Each name is versioned independently; a producer bumps `version` when its
 * payload shape changes rather than renaming the event.
 */
export type SupportedOutboxEventName =
  | "task.assigned"
  | "task.reviewed"
  | "discuss.message.created"
  | "meeting.participant.invited"
  | "meeting.reminder"
  | "task.due"
  | "task.overdue"
  | "expense.submitted"
  | "expense.reviewed"
  | "report.submitted"
  | "report.reviewed"
  | "todo.reminder"
  | "event.reminder"
  | "report.reminder"
  | "partner.follow_up_due"
  | "letter.shared"
  | "document.shared"
  | "attendance.shift.assigned"
  | "attendance.shift.schedule_changed"
  | "attendance.overtime.decided"
  | "attendance.exception.decided"
  | "leave.request.submitted"
  | "leave.request.decided";

/**
 * `meeting.participant.invited` v1 payload. The consumer resolves all other
 * notification content and authorization-sensitive state from the meeting.
 */
export interface MeetingParticipantInvitedEventPayload {
  participantUserId: string;
}

/**
 * `meeting.reminder` v1 payload. The deterministic key is
 * `<meetingId>:<exact reminder UTC instant>:meeting.reminder:v1`.
 */
export interface MeetingReminderEventPayload {
  occurrenceKey: string;
}

/**
 * `todo.reminder` v1 payload. The deterministic key is
 * `<todoId>:<exact reminder UTC instant>:todo.reminder:v1`.
 */
export interface TodoReminderEventPayload {
  occurrenceKey: string;
}

/**
 * `event.reminder` v1 payload. The deterministic key is
 * `<eventId>:<exact reminder UTC instant>:event.reminder:v1`.
 */
export interface EventReminderEventPayload {
  occurrenceKey: string;
}

/**
 * `report.reminder` v1 payload. The deterministic key is
 * `<reportId>:<periodEnd UTC instant>:report.reminder:v1`.
 */
export interface ReportReminderEventPayload {
  occurrenceKey: string;
}

/**
 * `partner.follow_up_due` v1 payload. The deterministic key is
 * `<partnerId>:<exact followUpAt UTC instant>:partner.follow_up_due:v1`.
 */
export interface PartnerFollowUpDueEventPayload {
  occurrenceKey: string;
}

/**
 * `letter.shared`/`document.shared` v1 payload. The consumer re-loads the
 * `Share` row by `shareId` rather than trusting any audience/scope data
 * here - the share may already be revoked by the time the event is
 * delivered.
 */
export interface LetterSharedEventPayload {
  shareId: string;
}

export interface DocumentSharedEventPayload {
  shareId: string;
}

/** `attendance.shift.assigned` v1 payload - one direct action, one recipient. */
export interface AttendanceShiftAssignedEventPayload {
  employeeId: string;
}

/**
 * `attendance.shift.schedule_changed` v1 payload - no recipient hint; the
 * consumer resolves every employee currently assigned to `resourceId`
 * (the shift) live, since a reschedule/cancellation/reinstatement affects
 * whoever is assigned at delivery time, not just at the moment it fired.
 */
export interface AttendanceShiftScheduleChangedEventPayload {
  changeType: string;
}

export interface AttendanceOvertimeDecidedEventPayload {
  employeeId: string;
}

export interface AttendanceExceptionDecidedEventPayload {
  employeeId: string;
}

/** `leave.request.submitted` v1 payload - the consumer resolves the
 * reviewing manager (the employee's department's manager) live. */
export interface LeaveRequestSubmittedEventPayload {
  employeeId: string;
}

export interface LeaveRequestDecidedEventPayload {
  employeeId: string;
}

export interface OutboxConsumerTarget {
  consumerName: string;
  consumerVersion: number;
}

export interface AppendOutboxEventInput {
  eventId?: string;
  name: SupportedOutboxEventName;
  version: number;
  occurredAt?: Date;
  actorKind: OutboxActorKind;
  actorUserId?: string;
  correlationId?: string;
  resourceType:
    | "task"
    | "message"
    | "meeting"
    | "expense"
    | "report"
    | "todo"
    | "event"
    | "partner"
    | "letter"
    | "document"
    | "event_shift"
    | "attendance_overtime_approval"
    | "attendance_exception"
    | "leave_request";
  resourceId: string;
  workspaceContext?: string;
  payload?: Prisma.InputJsonObject;
  /** At least one durable consumer - a best-effort-only event never reaches this table (ADR 0001 §1). */
  consumers: [OutboxConsumerTarget, ...OutboxConsumerTarget[]];
}

/** One claimed, due delivery obligation, joined with its event envelope (ADR 0004 §6). */
export interface ClaimedOutboxDelivery {
  deliveryId: string;
  attempts: number;
  event: {
    id: string;
    name: string;
    version: number;
    occurredAt: Date;
    actorKind: OutboxActorKind;
    actorUserId: string | null;
    correlationId: string | null;
    resourceType: string;
    resourceId: string | null;
    workspaceContext: string | null;
    payload: unknown;
  };
}
