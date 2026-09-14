import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

export const TASK_ERROR = {
  notFound: "TASK_NOT_FOUND",
  ownerRequired: "TASK_OWNER_REQUIRED",
  workspaceNotFound: "TASK_WORKSPACE_NOT_FOUND",
  departmentNotFound: "TASK_DEPARTMENT_NOT_FOUND",
  userNotFound: "TASK_USER_NOT_FOUND",
  assigneeNotAssigned: "TASK_ASSIGNEE_NOT_ASSIGNED",
  invalidTransition: "TASK_INVALID_TRANSITION",
  reviewStateConflict: "TASK_REVIEW_STATE_CONFLICT",
  scheduleInvalid: "TASK_SCHEDULE_INVALID",
  concurrentChange: "TASK_CONCURRENT_CHANGE",
} as const;

export function taskNotFound(): HttpException {
  return new NotFoundException({
    code: TASK_ERROR.notFound,
    error: "Not Found",
    detail: "No task exists with that id.",
  });
}

export function taskOwnerRequired(): HttpException {
  return new BadRequestException({
    code: TASK_ERROR.ownerRequired,
    error: "Bad Request",
    detail: "A task must belong to a workspace, a department, or both.",
  });
}

export function taskWorkspaceNotFound(): HttpException {
  return new NotFoundException({
    code: TASK_ERROR.workspaceNotFound,
    error: "Not Found",
    detail: "No workspace exists with that id.",
  });
}

export function taskDepartmentNotFound(): HttpException {
  return new NotFoundException({
    code: TASK_ERROR.departmentNotFound,
    error: "Not Found",
    detail: "No department exists with that id.",
  });
}

export function taskUserNotFound(): HttpException {
  return new NotFoundException({
    code: TASK_ERROR.userNotFound,
    error: "Not Found",
    detail: "No user exists with that id.",
  });
}

export function taskAssigneeNotAssigned(): HttpException {
  return new ConflictException({
    code: TASK_ERROR.assigneeNotAssigned,
    error: "Conflict",
    detail: "That user is not assigned to this task.",
  });
}

export function taskInvalidTransition(from: string, to: string): HttpException {
  return new ConflictException({
    code: TASK_ERROR.invalidTransition,
    error: "Conflict",
    detail: `A task in ${from} cannot be moved to ${to} by this operation.`,
  });
}

export function taskReviewStateConflict(): HttpException {
  return new ConflictException({
    code: TASK_ERROR.reviewStateConflict,
    error: "Conflict",
    detail: "Only a task under review can receive a review outcome.",
  });
}

export function taskScheduleInvalid(): HttpException {
  return new BadRequestException({
    code: TASK_ERROR.scheduleInvalid,
    error: "Bad Request",
    detail: "The task due date must be at or after its start date.",
  });
}

export function taskConcurrentChange(): HttpException {
  return new ConflictException({
    code: TASK_ERROR.concurrentChange,
    error: "Conflict",
    detail: "The task changed concurrently. Refresh it and try again.",
  });
}
