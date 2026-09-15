import type { components } from "@event-platform/api-client";

export type Task = components["schemas"]["TaskResponse"];
export type TaskStatus = Task["status"];
export type TaskPriority = Task["priority"];
export type TaskPerson = components["schemas"]["TaskPersonSummary"];
export type TaskComment = components["schemas"]["TaskCommentResponse"];
export type TaskActivity = components["schemas"]["TaskActivityResponse"];
export type TaskReview = components["schemas"]["TaskReviewResponse"];
export type ManagedFile = components["schemas"]["ManagedFileResponse"];

export const TASK_STATUSES: readonly TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "UNDER_REVIEW",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
];

export const KANBAN_STATUSES: readonly TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "UNDER_REVIEW",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  UNDER_REVIEW: "Under review",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export interface TaskCollaborationPreview {
  task: Task;
  comments: readonly TaskComment[];
  activity: readonly TaskActivity[];
  reviews: readonly TaskReview[];
  files: readonly ManagedFile[];
}

export interface TaskWorkspaceData {
  tasks: readonly Task[];
  details: Record<string, TaskCollaborationPreview>;
}

export function taskStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_LABELS[status];
}

export function taskPriorityLabel(priority: TaskPriority): string {
  return TASK_PRIORITY_LABELS[priority];
}

export function personName(
  person: Pick<TaskPerson, "firstName" | "lastName" | "email">,
): string {
  const parts = [person.firstName, person.lastName].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" ") : person.email;
}

export function dateLabel(iso: string | null): string {
  if (!iso) return "Not scheduled";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function scheduleLabel(task: Pick<Task, "startAt" | "dueAt">): string {
  if (task.startAt && task.dueAt) {
    return `${dateLabel(task.startAt)} - ${dateLabel(task.dueAt)}`;
  }
  if (task.dueAt) return `Due ${dateLabel(task.dueAt)}`;
  if (task.startAt) return `Starts ${dateLabel(task.startAt)}`;
  return "Not scheduled";
}
