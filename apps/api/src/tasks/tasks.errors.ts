import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

export const TASK_ERROR = {
  notFound: "TASK_NOT_FOUND",
  ownerRequired: "TASK_OWNER_REQUIRED",
  workspaceNotFound: "TASK_WORKSPACE_NOT_FOUND",
  departmentNotFound: "TASK_DEPARTMENT_NOT_FOUND",
  userNotFound: "TASK_USER_NOT_FOUND",
  assigneeOutsideDepartment: "TASK_ASSIGNEE_OUTSIDE_DEPARTMENT",
  assigneeNotAssigned: "TASK_ASSIGNEE_NOT_ASSIGNED",
  invalidTransition: "TASK_INVALID_TRANSITION",
  reviewStateConflict: "TASK_REVIEW_STATE_CONFLICT",
  scheduleInvalid: "TASK_SCHEDULE_INVALID",
  concurrentChange: "TASK_CONCURRENT_CHANGE",
  checklistItemNotFound: "TASK_CHECKLIST_ITEM_NOT_FOUND",
  checklistReorderMismatch: "TASK_CHECKLIST_REORDER_MISMATCH",
  checklistItemOwnershipDenied: "TASK_CHECKLIST_ITEM_OWNERSHIP_DENIED",
  reportToInvalid: "TASK_REPORT_TO_INVALID",
  assigneeNotEligible: "TASK_ASSIGNEE_NOT_ELIGIBLE",
  relatedNotFound: "TASK_RELATED_NOT_FOUND",
  reviewNoteRequired: "TASK_REVIEW_NOTE_REQUIRED",
  reviewerUnresolved: "TASK_REVIEWER_UNRESOLVED",
  reviewerInvalid: "TASK_REVIEWER_INVALID",
  reviewerReasonRequired: "TASK_REVIEWER_REASON_REQUIRED",
  checklistLocked: "TASK_CHECKLIST_LOCKED",
  subtaskNotAllowed: "TASK_SUBTASK_NOT_ALLOWED",
} as const;

export function taskRelatedNotFound(): HttpException {
  return new BadRequestException({
    code: TASK_ERROR.relatedNotFound,
    error: "Bad Request",
    detail:
      "The related event or campaign does not exist or is archived. Pick an active one.",
  });
}

/** TSK-### identifier from the task number (zero-padded to three digits). */
export function taskIdentifier(taskNumber: number): string {
  return `TSK-${String(taskNumber).padStart(3, "0")}`;
}

export function taskReviewNoteRequired(): HttpException {
  return new BadRequestException({
    code: TASK_ERROR.reviewNoteRequired,
    error: "Bad Request",
    detail:
      "Explain the requested changes in a note so the assignee can act on them.",
  });
}

export function taskReviewerUnresolved(): HttpException {
  return new ConflictException({
    code: TASK_ERROR.reviewerUnresolved,
    error: "Conflict",
    detail:
      "This task has no eligible reviewer. A Super Admin must designate one before it can be approved or sent back.",
  });
}

export function taskReviewerInvalid(): HttpException {
  return new BadRequestException({
    code: TASK_ERROR.reviewerInvalid,
    error: "Bad Request",
    detail:
      "The reviewer must be an active person who can review this department and is not assigned to the task.",
  });
}

export function taskReviewerReasonRequired(): HttpException {
  return new BadRequestException({
    code: TASK_ERROR.reviewerReasonRequired,
    error: "Bad Request",
    detail: "Give a reason for changing the reviewer.",
  });
}

export function taskChecklistLocked(): HttpException {
  return new ConflictException({
    code: TASK_ERROR.checklistLocked,
    error: "Conflict",
    detail:
      "The checklist is locked while the task is under review, completed or cancelled.",
  });
}

export function taskSubtaskNotAllowed(): HttpException {
  return new ForbiddenException({
    code: TASK_ERROR.subtaskNotAllowed,
    error: "Forbidden",
    detail:
      "You can only create subtasks under tasks you created or are assigned to.",
  });
}

export function taskAssigneeNotEligible(): HttpException {
  return new BadRequestException({
    code: TASK_ERROR.assigneeNotEligible,
    error: "Bad Request",
    detail: "Your role can't assign work to this person.",
  });
}

export function taskReportToInvalid(): HttpException {
  return new BadRequestException({
    code: TASK_ERROR.reportToInvalid,
    error: "Bad Request",
    detail:
      "Choose an active Super Admin, Admin, or the department's own manager as the reporting recipient.",
  });
}

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

export function taskAssigneeOutsideDepartment(): HttpException {
  return new BadRequestException({
    code: TASK_ERROR.assigneeOutsideDepartment,
    error: "Bad Request",
    detail: "That user does not belong to this task's department.",
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

export function taskChecklistItemNotFound(): HttpException {
  return new NotFoundException({
    code: TASK_ERROR.checklistItemNotFound,
    error: "Not Found",
    detail: "No checklist item exists with that id on this task.",
  });
}

export function taskChecklistReorderMismatch(): HttpException {
  return new BadRequestException({
    code: TASK_ERROR.checklistReorderMismatch,
    error: "Bad Request",
    detail:
      "The reorder list must contain exactly this task's current checklist item ids.",
  });
}

export function taskChecklistItemOwnershipDenied(): HttpException {
  return new ForbiddenException({
    code: TASK_ERROR.checklistItemOwnershipDenied,
    error: "Forbidden",
    detail: "Only the person who added this checkpoint may edit or remove it.",
  });
}
