import type { components } from "@event-platform/api-client";

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

export type TodoItem = components["schemas"]["TodoResponse"];
export type TodoFeedResponse = components["schemas"]["TodoFeedResponse"];

/** A selectable option for the "related event"/"related project" pickers. */
export interface RelatedOption {
  id: string;
  name: string;
}

/** SRS 5.15's "To-Do Categories" (`MY_DAY` through `COMPLETED`), plus `ALL` -
 * without it, an item that is none of Work/Personal, not high/urgent
 * priority, not due today or later, and not completed (e.g. an undated
 * Reminder, Quick Note, or Follow-Up) would have no view that ever shows it.
 * `MY_DAY`/`IMPORTANT`/`UPCOMING` are computed from `dueDate`/`priority`/
 * `status`, not stored fields - the same "smart views are derived, not
 * persisted" decision TODO-01's schema made. */
export const TODO_SMART_VIEWS = [
  "ALL",
  "MY_DAY",
  "IMPORTANT",
  "UPCOMING",
  "WORK",
  "PERSONAL",
  "COMPLETED",
] as const;
export type TodoSmartView = (typeof TODO_SMART_VIEWS)[number];
export const TODO_SMART_VIEW_LABELS: Record<TodoSmartView, string> = {
  ALL: "All",
  MY_DAY: "My Day",
  IMPORTANT: "Important",
  UPCOMING: "Upcoming",
  WORK: "Work",
  PERSONAL: "Personal",
  COMPLETED: "Completed",
};
