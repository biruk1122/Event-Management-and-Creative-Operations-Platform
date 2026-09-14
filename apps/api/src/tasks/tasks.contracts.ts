import { ApiProperty } from "@nestjs/swagger";

import {
  TaskActivityType,
  TaskPriority,
  TaskReviewOutcome,
  TaskStatus,
} from "../generated/prisma/client.js";

export class TaskPersonSummary {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "email" })
  email!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;
}

export class TaskAssigneeResponse extends TaskPersonSummary {
  @ApiProperty({ format: "date-time" })
  assignedAt!: string;
}

export class TaskResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  workspaceId!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  departmentId!: string | null;

  @ApiProperty({ example: "Confirm venue permits" })
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ enum: TaskPriority })
  priority!: TaskPriority;

  @ApiProperty({ enum: TaskStatus })
  status!: TaskStatus;

  @ApiProperty({ minimum: 0, maximum: 100 })
  progress!: number;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  startAt!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  dueAt!: string | null;

  @ApiProperty({ type: [TaskAssigneeResponse] })
  assignees!: TaskAssigneeResponse[];

  @ApiProperty({ type: TaskPersonSummary, nullable: true })
  createdBy!: TaskPersonSummary | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

export class PaginatedTasksResponse {
  @ApiProperty({ type: [TaskResponse] })
  items!: TaskResponse[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;
}

export class TaskCommentResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "The permit was submitted." })
  content!: string;

  @ApiProperty({ type: TaskPersonSummary, nullable: true })
  author!: TaskPersonSummary | null;

  @ApiProperty({ type: [TaskPersonSummary] })
  mentionedUsers!: TaskPersonSummary[];

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

export class PaginatedTaskCommentsResponse {
  @ApiProperty({ type: [TaskCommentResponse] })
  items!: TaskCommentResponse[];

  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
}

export class TaskReviewResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: TaskReviewOutcome })
  outcome!: TaskReviewOutcome;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({ type: TaskPersonSummary, nullable: true })
  reviewer!: TaskPersonSummary | null;

  @ApiProperty({ format: "date-time" })
  reviewedAt!: string;
}

export class PaginatedTaskReviewsResponse {
  @ApiProperty({ type: [TaskReviewResponse] })
  items!: TaskReviewResponse[];

  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
}

export class TaskActivityResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: TaskActivityType })
  type!: TaskActivityType;

  @ApiProperty({ type: TaskPersonSummary, nullable: true })
  actor!: TaskPersonSummary | null;

  @ApiProperty({
    type: "object",
    additionalProperties: true,
    description: "Structured before/after values for this activity type.",
  })
  details!: Record<string, unknown>;

  @ApiProperty({ format: "date-time" })
  occurredAt!: string;
}

export class PaginatedTaskActivitiesResponse {
  @ApiProperty({ type: [TaskActivityResponse] })
  items!: TaskActivityResponse[];

  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
}
