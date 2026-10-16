import { ApiProperty } from "@nestjs/swagger";
import { ProductionStatus } from "../generated/prisma/client.js";

class ProductionPerson {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "email" }) email!: string;
  @ApiProperty({ type: String, nullable: true }) firstName!: string | null;
  @ApiProperty({ type: String, nullable: true }) lastName!: string | null;
}
class ProductionTeam {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
}
class ProductionTalentPerson {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() type!: string;
}
class ProductionTalentAssignment {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() role!: string;
  @ApiProperty({ type: ProductionTalentPerson })
  talent!: ProductionTalentPerson;
}
export class ProductionResponse {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) workspaceId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() productionType!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, format: "date-time", nullable: true }) startAt!:
    string | null;
  @ApiProperty({ type: String, format: "date-time", nullable: true }) endAt!:
    string | null;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  deadlineAt!: string | null;
  @ApiProperty({ enum: ProductionStatus }) status!: ProductionStatus;
  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description:
      "Soft cross-reference to an event this production supports (EOM-01).",
  })
  eventId!: string | null;
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  departmentId!: string | null;
  @ApiProperty({ type: ProductionPerson, nullable: true })
  manager!: ProductionPerson | null;
  @ApiProperty({ type: [ProductionTeam] }) teams!: ProductionTeam[];
  @ApiProperty({ type: [ProductionPerson] }) participants!: ProductionPerson[];
  @ApiProperty({ type: [ProductionTalentAssignment] })
  talents!: ProductionTalentAssignment[];
  @ApiProperty({ type: ProductionPerson, nullable: true })
  createdBy!: ProductionPerson | null;
  @ApiProperty({ format: "date-time" }) createdAt!: string;
  @ApiProperty({ format: "date-time" }) updatedAt!: string;
}
export class PaginatedProductionsResponse {
  @ApiProperty({ type: [ProductionResponse] }) items!: ProductionResponse[];
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
}

/**
 * A production budget. Sensitive (PC-04): served only through the budget
 * routes, which require `production.budget.read` / `production.budget.update`.
 * Amount and currency are always set together or both null.
 */
export class ProductionBudgetResponse {
  @ApiProperty({
    type: String,
    nullable: true,
    example: "15000.00",
    description:
      "Decimal string with two fraction digits. Null when no budget is set.",
  })
  amount!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: "USD",
    description: "ISO-4217 alphabetic code. Null when no budget is set.",
  })
  currency!: string | null;
}

/**
 * Planned vs. actual for one production. `actualApproved` and
 * `actualPending` are always reported separately - a pending expense is
 * never counted as approved spending. `linkedEventId` is `null` when this
 * production has no linked event, in which case actual/pending are always
 * "0.00" (not computed, since expenses are recorded against events) - treat
 * a `null` `linkedEventId` as "actuals unavailable", not "no spend yet".
 */
export class ProductionBudgetSummaryResponse {
  @ApiProperty({ type: String, nullable: true, example: "15000.00" })
  plannedAmount!: string | null;

  @ApiProperty({ type: String, nullable: true, example: "USD" })
  currency!: string | null;

  @ApiProperty({
    type: String,
    example: "9800.00",
    description:
      "Sum of APPROVED expenses' actual amounts for the linked event.",
  })
  actualApproved!: string;

  @ApiProperty({
    type: String,
    example: "1350.00",
    description:
      "Sum of SUBMITTED (pending) expenses' actual amounts for the linked event.",
  })
  actualPending!: string;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  linkedEventId!: string | null;
}
