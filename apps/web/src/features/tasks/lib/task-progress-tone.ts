import type { ProgressBarTone } from "@/components/ui/progress-bar";

import type { Task } from "./tasks-types";

/** Status (+ overdue check), never raw percentage, drives color - pairs
 * with the status badge text, since color alone never carries meaning. */
export function taskProgressTone(
  task: Pick<Task, "status" | "dueAt">,
): ProgressBarTone {
  const overdue = Boolean(
    task.dueAt &&
    new Date(task.dueAt) < new Date() &&
    task.status !== "COMPLETED" &&
    task.status !== "CANCELLED",
  );
  // Overdue is a genuine problem regardless of status - red. Blocked just
  // means "waiting on someone else," not an error - amber, same as the
  // status badge's own tone for it.
  if (overdue) return "danger";
  if (task.status === "BLOCKED") return "attention";
  if (task.status === "COMPLETED") return "success";
  if (task.status === "UNDER_REVIEW") return "attention";
  if (task.status === "IN_PROGRESS") return "active";
  return "neutral"; // TODO, CANCELLED
}

export function taskProgressSummary(progress: number | null): string {
  return progress === null
    ? "Not tracked - no checkpoints yet"
    : `${progress}% complete`;
}
