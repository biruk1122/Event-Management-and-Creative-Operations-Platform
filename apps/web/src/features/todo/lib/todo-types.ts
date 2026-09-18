/** Mirrors `TodoResponse` (apps/api/src/todo/todo.contracts.ts). Hand-rolled
 * for now - TODO-05 replaces this with types aliased from the generated
 * OpenAPI schema once the UI is wired to the real API, matching how every
 * other feature in this repo made that same transition. */
export const TODO_TYPES = [
  "PERSONAL",
  "WORK",
  "REMINDER",
  "QUICK_NOTE",
  "FOLLOW_UP",
] as const;
export type TodoType = (typeof TODO_TYPES)[number];
export const TODO_TYPE_LABELS: Record<TodoType, string> = {
  PERSONAL: "Personal",
  WORK: "Work",
  REMINDER: "Reminder",
  QUICK_NOTE: "Quick note",
  FOLLOW_UP: "Follow-up",
};

export const TODO_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TodoPriority = (typeof TODO_PRIORITIES)[number];
export const TODO_PRIORITY_LABELS: Record<TodoPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const TODO_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
] as const;
export type TodoStatus = (typeof TODO_STATUSES)[number];
export const TODO_STATUS_LABELS: Record<TodoStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
};

export interface TodoItem {
  id: string;
  title: string;
  description: string | null;
  type: TodoType;
  priority: TodoPriority;
  status: TodoStatus;
  /** "YYYY-MM-DD", or null if no due date is set. */
  dueDate: string | null;
  /** "HH:mm:ss", paired with `dueDate` - never set without it. */
  dueTime: string | null;
  relatedEventId: string | null;
  relatedProjectId: string | null;
  reminderEnabled: boolean;
  /** ISO 8601 UTC, or null when no reminder is scheduled. */
  reminderAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A selectable option for the "related event"/"related project" pickers. */
export interface RelatedOption {
  id: string;
  name: string;
}

/** SRS 5.15's "To-Do Categories". `MY_DAY` and `IMPORTANT`/`UPCOMING` are
 * computed from `dueDate`/`priority`/`status`, not stored fields - the same
 * "smart views are derived, not persisted" decision TODO-01's schema made. */
export const TODO_SMART_VIEWS = [
  "MY_DAY",
  "IMPORTANT",
  "UPCOMING",
  "WORK",
  "PERSONAL",
  "COMPLETED",
] as const;
export type TodoSmartView = (typeof TODO_SMART_VIEWS)[number];
export const TODO_SMART_VIEW_LABELS: Record<TodoSmartView, string> = {
  MY_DAY: "My Day",
  IMPORTANT: "Important",
  UPCOMING: "Upcoming",
  WORK: "Work",
  PERSONAL: "Personal",
  COMPLETED: "Completed",
};
