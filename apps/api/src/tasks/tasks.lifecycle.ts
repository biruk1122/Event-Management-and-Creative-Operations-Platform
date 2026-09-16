import { TaskReviewOutcome, TaskStatus } from "../generated/prisma/client.js";

const ASSIGNEE_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  [TaskStatus.TODO]: [
    TaskStatus.IN_PROGRESS,
    TaskStatus.BLOCKED,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.BLOCKED, TaskStatus.CANCELLED],
  [TaskStatus.UNDER_REVIEW]: [],
  [TaskStatus.BLOCKED]: [
    TaskStatus.TODO,
    TaskStatus.IN_PROGRESS,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.COMPLETED]: [],
  [TaskStatus.CANCELLED]: [],
};

export function canAssigneeTransition(
  from: TaskStatus,
  to: TaskStatus,
): boolean {
  return ASSIGNEE_TRANSITIONS[from].includes(to);
}

export function reviewTarget(outcome: TaskReviewOutcome): TaskStatus {
  return outcome === TaskReviewOutcome.APPROVED
    ? TaskStatus.COMPLETED
    : TaskStatus.IN_PROGRESS;
}
