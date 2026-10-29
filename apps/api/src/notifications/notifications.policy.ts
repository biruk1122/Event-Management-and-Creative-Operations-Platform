import { NotificationType } from "../generated/prisma/client.js";

/**
 * The types a recipient may mute (ADR 0003 §4). Assignment,
 * review-outcome, mention, and meeting-invitation notifications represent a
 * direct action, outcome, or participation obligation and can never be
 * silenced. The database CHECK constraint on `notification_preferences`
 * enforces the same restriction independently; this list is the application
 * layer's copy of that same rule, used to produce a stable 400 instead of
 * surfacing a raw constraint violation.
 */
export const MUTABLE_NOTIFICATION_TYPES: readonly NotificationType[] = [
  NotificationType.TASK_DUE,
  NotificationType.TASK_OVERDUE,
  NotificationType.NEW_MESSAGE,
  NotificationType.MEETING_REMINDER,
  NotificationType.EVENT_REMINDER,
  NotificationType.TODO_REMINDER,
  NotificationType.REPORT_REMINDER,
  NotificationType.PARTNER_FOLLOW_UP_DUE,
  NotificationType.LETTER_SHARED,
  NotificationType.DOCUMENT_SHARED,
];

export function isMutableNotificationType(type: NotificationType): boolean {
  return MUTABLE_NOTIFICATION_TYPES.includes(type);
}

export interface NotificationContent {
  title: string;
  body: string;
}

export function taskAssignedContent(taskTitle: string): NotificationContent {
  return { title: "You were assigned a task", body: taskTitle };
}

export function taskApprovedContent(taskTitle: string): NotificationContent {
  return { title: "Task approved", body: taskTitle };
}

export function taskRejectedContent(taskTitle: string): NotificationContent {
  return { title: "Changes requested on your task", body: taskTitle };
}

export function taskDueContent(taskTitle: string): NotificationContent {
  return { title: "Task due", body: taskTitle };
}

export function taskOverdueContent(taskTitle: string): NotificationContent {
  return { title: "Task overdue", body: taskTitle };
}

export function newMessageContent(preview: string): NotificationContent {
  return { title: "New message", body: preview };
}

export function messageMentionContent(preview: string): NotificationContent {
  return { title: "You were mentioned", body: preview };
}

export function meetingInvitationContent(
  meetingTitle: string,
): NotificationContent {
  return { title: "Meeting invitation", body: meetingTitle };
}

export function meetingReminderContent(
  meetingTitle: string,
): NotificationContent {
  return { title: "Meeting reminder", body: meetingTitle };
}

export function expenseSubmittedContent(
  description: string,
): NotificationContent {
  return { title: "Expense submitted for approval", body: description };
}

export function expenseApprovedContent(
  description: string,
): NotificationContent {
  return { title: "Expense approved", body: description };
}

export function expenseRejectedContent(
  description: string,
): NotificationContent {
  return { title: "Expense rejected", body: description };
}

export function reportSubmittedContent(
  reportTitle: string,
): NotificationContent {
  return { title: "Report submitted for review", body: reportTitle };
}

export function reportReviewedContent(
  reportTitle: string,
): NotificationContent {
  return { title: "Report reviewed", body: reportTitle };
}

export function reportChangesRequestedContent(
  reportTitle: string,
): NotificationContent {
  return { title: "Changes requested on your report", body: reportTitle };
}

export function todoReminderContent(title: string): NotificationContent {
  return { title: "To-Do reminder", body: title };
}

export function eventReminderContent(name: string): NotificationContent {
  return { title: "Event reminder", body: name };
}

export function reportReminderContent(title: string): NotificationContent {
  return { title: "Report reminder", body: title };
}

export function partnerFollowUpDueContent(
  organizationName: string,
): NotificationContent {
  return { title: "Partner follow-up due", body: organizationName };
}

export function letterSharedContent(
  referenceNumber: string,
): NotificationContent {
  return { title: "A letter was shared with you", body: referenceNumber };
}

export function documentSharedContent(
  displayName: string,
): NotificationContent {
  return { title: "A document was shared with you", body: displayName };
}

export function attendanceShiftAssignedContent(
  eventName: string,
): NotificationContent {
  return { title: "You were assigned a shift", body: eventName };
}

export function attendanceShiftScheduleChangedContent(
  eventName: string,
): NotificationContent {
  return { title: "A shift you're assigned to changed", body: eventName };
}

export function attendanceOvertimeApprovedContent(
  eventDate: string,
): NotificationContent {
  return { title: "Overtime approved", body: eventDate };
}

export function attendanceOvertimeRejectedContent(
  eventDate: string,
): NotificationContent {
  return { title: "Overtime rejected", body: eventDate };
}

export function attendanceExceptionApprovedContent(
  description: string,
): NotificationContent {
  return { title: "Attendance exception approved", body: description };
}

export function attendanceExceptionRejectedContent(
  description: string,
): NotificationContent {
  return { title: "Attendance exception rejected", body: description };
}

export function leaveRequestSubmittedContent(
  employeeName: string,
): NotificationContent {
  return { title: "Leave request needs your review", body: employeeName };
}

export function leaveRequestApprovedContent(
  leaveTypeName: string,
): NotificationContent {
  return { title: "Leave request approved", body: leaveTypeName };
}

export function leaveRequestRejectedContent(
  leaveTypeName: string,
): NotificationContent {
  return { title: "Leave request rejected", body: leaveTypeName };
}

export function leaveRequestReturnedContent(
  leaveTypeName: string,
): NotificationContent {
  return { title: "Leave request returned for changes", body: leaveTypeName };
}

/** Server-derived body text is bounded, never the raw message verbatim past
 * this length (ADR 0003 §1: title/body are server-derived, not client input). */
export function previewText(content: string, maxLength = 140): string {
  const trimmed = content.trim();
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength - 1)}…`
    : trimmed;
}
