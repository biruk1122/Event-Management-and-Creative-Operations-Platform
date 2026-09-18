import { NotificationType } from "../generated/prisma/client.js";

/**
 * The seven types a recipient may mute (ADR 0003 §4). Assignment,
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

/** Server-derived body text is bounded, never the raw message verbatim past
 * this length (ADR 0003 §1: title/body are server-derived, not client input). */
export function previewText(content: string, maxLength = 140): string {
  const trimmed = content.trim();
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength - 1)}…`
    : trimmed;
}
