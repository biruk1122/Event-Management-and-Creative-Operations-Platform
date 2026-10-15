import { ApiProperty } from "@nestjs/swagger";

import {
  ReportReviewOutcome,
  ReportStatus,
  ReportType,
} from "../generated/prisma/client.js";

export class ReportReviewResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) reviewerId!: string;
  @ApiProperty({ enum: ReportReviewOutcome }) outcome!: ReportReviewOutcome;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ format: "date-time" }) reviewedAt!: string;
}

export class ReportResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ enum: ReportType }) type!: ReportType;
  @ApiProperty() title!: string;
  @ApiProperty({ format: "date" }) periodStart!: string;
  @ApiProperty({ format: "date" }) periodEnd!: string;
  @ApiProperty({ format: "uuid" }) authorId!: string;
  @ApiProperty({ type: String, nullable: true, format: "uuid" }) departmentId!:
    string | null;
  @ApiProperty({ enum: ReportStatus }) status!: ReportStatus;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "A free-text summary, independent of the type-specific sections below.",
  })
  description!: string | null;
  @ApiProperty({ type: String, nullable: true }) problemsEncountered!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) nextDayPlan!: string | null;
  @ApiProperty({ type: String, nullable: true }) departmentActivities!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) majorAchievements!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) challenges!: string | null;
  @ApiProperty({ type: String, nullable: true }) nextWeekPlan!: string | null;
  @ApiProperty({ type: String, nullable: true }) departmentPerformance!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) employeePerformance!:
    string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "Post-event only.",
  })
  lessonsLearned!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "Post-event only.",
  })
  recommendations!: string | null;
  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  submittedAt!: string | null;
  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  reviewedAt!: string | null;
  @ApiProperty({ type: String, nullable: true, format: "uuid" }) reviewerId!:
    string | null;
  @ApiProperty({ type: [String], format: "uuid" }) workspaceIds!: string[];
  @ApiProperty({ type: [ReportReviewResponse] })
  reviews!: ReportReviewResponse[];
  @ApiProperty({ format: "date-time" }) createdAt!: string;
  @ApiProperty({ format: "date-time" }) updatedAt!: string;
}

export class PaginatedReportsResponse {
  @ApiProperty({ type: [ReportResponse] }) items!: ReportResponse[];
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
}

/** Live, author-scoped counts from Tasks and Projects, never copied into
 * reports. The `event*`/`budget*` fields are live for POST_EVENT reports
 * only (null otherwise) - the event this report covers, resolved through
 * the existing ReportWorkspace join, never a stored snapshot. */
export class ReportFactsResponse {
  @ApiProperty({ format: "date-time" }) asOf!: string;
  @ApiProperty() completedTasksInPeriod!: number;
  @ApiProperty() inProgressTasksNow!: number;
  @ApiProperty() pendingTasksNow!: number;
  @ApiProperty() overdueTasksNow!: number;
  @ApiProperty({ type: Number, nullable: true }) totalProjectsNow!:
    number | null;
  @ApiProperty({ type: Number, nullable: true }) completedProjectsNow!:
    number | null;
  @ApiProperty({ type: Number, nullable: true }) activeProjectsNow!:
    number | null;
  @ApiProperty({ type: Number, nullable: true }) eventTotalTasksNow!:
    number | null;
  @ApiProperty({ type: Number, nullable: true }) eventCompletedTasksNow!:
    number | null;
  @ApiProperty({ type: Number, nullable: true }) eventIncompleteTasksNow!:
    number | null;
  @ApiProperty({ type: String, nullable: true }) eventPlannedAmount!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) eventBudgetCurrency!:
    string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "Never includes pending (SUBMITTED) expenses.",
  })
  eventActualApproved!: string | null;
  @ApiProperty({ type: String, nullable: true }) eventActualPending!:
    string | null;
}

export class ReportDetailResponse extends ReportResponse {
  @ApiProperty({ type: ReportFactsResponse }) facts!: ReportFactsResponse;
}
