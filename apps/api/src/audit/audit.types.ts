import type {
  AuditActorKind,
  AuditOutcome,
} from "../generated/prisma/client.js";

export type SupportedAuditAction =
  | "authorization.denied"
  | "task.assignee_added"
  | "task.assignee_removed"
  | "task.submitted_for_review"
  | "task.review.approved"
  | "task.review.changes_requested"
  | "report.submitted"
  | "report.review_started"
  | "report.reviewed"
  | "report.changes_requested"
  | "managed_file.downloaded"
  | "report.exported"
  | "expense.submitted"
  | "expense.review.approved"
  | "expense.review.rejected"
  | "letter.created"
  | "letter.updated"
  | "letter.deleted"
  | "letter.shared"
  | "document.created"
  | "document.updated"
  | "document.deleted"
  | "document.shared"
  | "share.revoked"
  | "attendance.checked_in"
  | "attendance.checked_out"
  | "attendance.kiosk.registered"
  | "attendance.kiosk.revoked"
  | "attendance.shift.created"
  | "attendance.shift.rescheduled"
  | "attendance.shift.cancelled"
  | "attendance.shift.reinstated"
  | "attendance.shift.assignment_added"
  | "attendance.shift.assignment_removed"
  | "attendance.overtime.approved"
  | "attendance.overtime.rejected"
  | "attendance.exception.approved"
  | "attendance.exception.rejected"
  | "attendance.calendar.weekday_updated"
  | "attendance.calendar.holiday_created"
  | "attendance.calendar.holiday_updated"
  | "attendance.calendar.holiday_removed"
  | "leave.type.created"
  | "leave.type.updated"
  | "leave.grant.created"
  | "leave.request.submitted"
  | "leave.request.withdrawn"
  | "leave.request.approved"
  | "leave.request.rejected"
  | "leave.request.returned_for_changes";

export interface AppendAuditRecordInput {
  actorKind: AuditActorKind;
  actorUserId?: string;
  requestId?: string;
  correlationId?: string;
  action: SupportedAuditAction;
  resourceType:
    | "task"
    | "managed_file"
    | "report"
    | "expense"
    | "letter"
    | "document"
    | "share"
    | "attendance_session"
    | "attendance_kiosk"
    | "event_shift"
    | "attendance_overtime_approval"
    | "attendance_exception"
    | "attendance_weekday_schedule"
    | "attendance_holiday"
    | "leave_type"
    | "leave_grant"
    | "leave_request";
  resourceId: string | null;
  workspaceContext?: string;
  outcome: AuditOutcome;
  metadata?: Record<string, string | number | boolean | null>;
}
