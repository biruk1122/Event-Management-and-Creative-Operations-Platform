import { ApiProperty } from "@nestjs/swagger";

import {
  ExpenseCategory,
  ExpenseReviewOutcome,
  ExpenseStatus,
} from "../generated/prisma/client.js";

/** One immutable decision in an expense's review history. */
export class ExpenseReviewSummary {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  reviewerId!: string;

  @ApiProperty({ enum: ExpenseReviewOutcome })
  outcome!: ExpenseReviewOutcome;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({ format: "date-time" })
  reviewedAt!: string;
}

/**
 * Public view of an expense. `expense.approve` is Super-Admin-only by
 * design (EOM-01) - the review history below is the complete, auditable
 * record of every approve/reject decision, never overwritten.
 */
export class ExpenseResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description: "Null when this expense is recorded directly against a production (productionId set instead).",
  })
  eventId!: string | null;

  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description: "Null when this expense is recorded against an event rather than directly against a production.",
  })
  productionId!: string | null;

  @ApiProperty({ format: "uuid" })
  departmentId!: string;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  supplierId!: string | null;

  @ApiProperty({ enum: ExpenseCategory })
  category!: ExpenseCategory;

  @ApiProperty({ example: "Stage lighting rental" })
  description!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: "1200.00",
    description: "Decimal string with two fraction digits.",
  })
  plannedAmount!: string | null;

  @ApiProperty({ type: String, example: "1350.00" })
  actualAmount!: string;

  @ApiProperty({ example: "USD" })
  currency!: string;

  @ApiProperty({ enum: ExpenseStatus })
  status!: ExpenseStatus;

  @ApiProperty({ format: "uuid", nullable: true, type: String })
  createdById!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  submittedAt!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  reviewedAt!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  reviewerId!: string | null;

  @ApiProperty({ type: [ExpenseReviewSummary] })
  reviews!: ExpenseReviewSummary[];

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

export class PaginatedExpensesResponse {
  @ApiProperty({ type: [ExpenseResponse] })
  items!: ExpenseResponse[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({ example: 7 })
  total!: number;
}

/**
 * Planned vs. actual for one event (SRS budget comparison). `actualApproved`
 * and `actualPending` are always reported separately - a pending expense is
 * never counted as approved spending.
 */
export class EventBudgetSummaryResponse {
  @ApiProperty({ type: String, nullable: true, example: "15000.00" })
  plannedAmount!: string | null;

  @ApiProperty({ type: String, nullable: true, example: "USD" })
  currency!: string | null;

  @ApiProperty({
    type: String,
    example: "9800.00",
    description: "Sum of APPROVED expenses' actual amounts.",
  })
  actualApproved!: string;

  @ApiProperty({
    type: String,
    example: "1350.00",
    description: "Sum of SUBMITTED (pending) expenses' actual amounts.",
  })
  actualPending!: string;
}
