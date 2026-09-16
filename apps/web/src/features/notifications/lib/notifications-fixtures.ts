import type {
  NotificationItem,
  NotificationPreference,
} from "./notifications-types";

/** Presentation-only data for EVE-114. EVE-115 replaces this boundary with REST. */
export const NOTIFICATION_FIXTURE: readonly NotificationItem[] = [
  {
    id: "notification-1",
    type: "TASK_ASSIGNED",
    title: "You were assigned a task",
    body: "Confirm venue permits",
    createdAt: "2026-09-16T07:30:00.000Z",
    readAt: null,
  },
  {
    id: "notification-2",
    type: "MESSAGE_MENTION",
    title: "You were mentioned",
    body: "Maya mentioned you in Event launch planning.",
    createdAt: "2026-09-16T06:45:00.000Z",
    readAt: null,
  },
  {
    id: "notification-3",
    type: "TASK_APPROVED",
    title: "Task approved",
    body: "Guest briefing was approved.",
    createdAt: "2026-09-15T15:00:00.000Z",
    readAt: "2026-09-15T15:10:00.000Z",
  },
];

export const NOTIFICATION_PREFERENCES_FIXTURE: readonly NotificationPreference[] =
  [
    { type: "TASK_DUE", muted: false },
    { type: "TASK_OVERDUE", muted: false },
    { type: "NEW_MESSAGE", muted: false },
    { type: "MEETING_REMINDER", muted: false },
    { type: "EVENT_REMINDER", muted: false },
    { type: "TODO_REMINDER", muted: false },
    { type: "REPORT_REMINDER", muted: false },
  ];
