import type { TaskStatus } from "./tasks-types";

/** Status moves an assignee may make, mirroring the server's lifecycle table
 * (apps/api tasks.lifecycle.ts). Review and completion are not in it: they go
 * through submit and the designated reviewer. */
export const ASSIGNEE_TRANSITION_TARGETS: Record<
  TaskStatus,
  readonly TaskStatus[]
> = {
  TODO: ["IN_PROGRESS", "BLOCKED", "CANCELLED"],
  IN_PROGRESS: ["BLOCKED", "CANCELLED"],
  UNDER_REVIEW: [],
  BLOCKED: ["TODO", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};
