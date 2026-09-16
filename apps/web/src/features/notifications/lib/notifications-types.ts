export type NotificationType =
  | "TASK_ASSIGNED"
  | "TASK_DUE"
  | "TASK_OVERDUE"
  | "TASK_APPROVED"
  | "TASK_REJECTED"
  | "NEW_MESSAGE"
  | "MESSAGE_MENTION"
  | "MEETING_INVITATION"
  | "MEETING_REMINDER"
  | "EVENT_REMINDER"
  | "TODO_REMINDER"
  | "REPORT_REMINDER";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export type MutableNotificationType =
  | "TASK_DUE"
  | "TASK_OVERDUE"
  | "NEW_MESSAGE"
  | "MEETING_REMINDER"
  | "EVENT_REMINDER"
  | "TODO_REMINDER"
  | "REPORT_REMINDER";

export interface NotificationPreference {
  type: MutableNotificationType;
  muted: boolean;
}

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
