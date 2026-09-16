import type { components } from "@event-platform/api-client";

export type NotificationItem = components["schemas"]["NotificationResponse"];
export type NotificationType = NotificationItem["type"];
export type NotificationFeed =
  components["schemas"]["NotificationFeedResponse"];
export type NotificationPreference =
  components["schemas"]["NotificationPreferenceResponse"];
export type MutableNotificationType = NotificationPreference["type"];
export type PaginatedNotifications = NotificationFeed;

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  TASK_ASSIGNED: "Task assignment",
  TASK_DUE: "Task due",
  TASK_OVERDUE: "Overdue task",
  TASK_APPROVED: "Task approved",
  TASK_REJECTED: "Task needs changes",
  NEW_MESSAGE: "New message",
  MESSAGE_MENTION: "Message mention",
  MEETING_INVITATION: "Meeting invitation",
  MEETING_REMINDER: "Meeting reminder",
  EVENT_REMINDER: "Event reminder",
  TODO_REMINDER: "To-Do reminder",
  REPORT_REMINDER: "Report reminder",
};
