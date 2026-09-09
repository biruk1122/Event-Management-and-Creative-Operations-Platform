import { ApiProperty } from "@nestjs/swagger";

import { EventStatus, EventType } from "../generated/prisma/client.js";

/** A user attached to an event through its connected workspace, or its author. */
export class EventPersonSummary {
  @ApiProperty({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  })
  id!: string;

  @ApiProperty({ format: "email", example: "dana.okafor@example.com" })
  email!: string;

  @ApiProperty({ type: String, nullable: true, example: "Dana" })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true, example: "Okafor" })
  lastName!: string | null;
}

/** A team assigned to an event through its connected workspace. */
export class EventTeamSummary {
  @ApiProperty({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  })
  id!: string;

  @ApiProperty({ example: "Production Team" })
  name!: string;
}

/**
 * Public view of an event and its connected workspace overview: the shared
 * operational context (the event manager, the assigned teams, and the assigned
 * employees) is read from the event's `Workspace` (WSP-01), never re-modelled
 * here. The budget is deliberately absent - it is sensitive (PC-04) and is
 * served only by the dedicated `/events/{id}/budget` routes. The event-to-talent
 * assignment (SRS `EventTalent`) is delivered once Talent Management provides a
 * `talents` table.
 */
export class EventResponse {
  @ApiProperty({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  })
  id!: string;

  @ApiProperty({
    format: "uuid",
    description:
      "The connected workspace that anchors this event's manager, teams, and participants.",
  })
  workspaceId!: string;

  @ApiProperty({ example: "Autumn Product Launch" })
  name!: string;

  @ApiProperty({ enum: EventType })
  eventType!: EventType;

  @ApiProperty({ type: String, nullable: true, example: "Opening night gala." })
  description!: string | null;

  @ApiProperty({ enum: EventStatus, description: "Current lifecycle state." })
  status!: EventStatus;

  @ApiProperty({
    type: String,
    format: "date-time",
    nullable: true,
    description: "UTC start. Null while the event is not yet scheduled.",
  })
  startAt!: string | null;

  @ApiProperty({
    type: String,
    format: "date-time",
    nullable: true,
    description: "UTC end. Never before the start when both are set.",
  })
  endAt!: string | null;

  @ApiProperty({ type: String, nullable: true, example: "Grand Hall" })
  location!: string | null;

  @ApiProperty({ type: String, nullable: true, example: "City Arts Council" })
  organizerName!: string | null;

  @ApiProperty({
    type: EventPersonSummary,
    nullable: true,
    description: "The event manager, from the connected workspace.",
  })
  manager!: EventPersonSummary | null;

  @ApiProperty({
    type: [EventTeamSummary],
    description: "Teams assigned to this event, from the connected workspace.",
  })
  teams!: EventTeamSummary[];

  @ApiProperty({
    type: [EventPersonSummary],
    description:
      "Employees assigned to this event individually, from the connected workspace.",
  })
  participants!: EventPersonSummary[];

  @ApiProperty({
    type: EventPersonSummary,
    nullable: true,
    description: "The user who created the event; null once that user is gone.",
  })
  createdBy!: EventPersonSummary | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

/** A page of events for the administration and connected-workspace overview. */
export class PaginatedEventsResponse {
  @ApiProperty({ type: [EventResponse] })
  items!: EventResponse[];

  @ApiProperty({ example: 1, description: "1-based page number." })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({ example: 7, description: "Total events matching the filter." })
  total!: number;
}

/**
 * An event budget. Sensitive (PC-04): served only through the budget routes,
 * which require `event.budget.read` / `event.budget.update`. Amount and currency
 * are always set together or both null.
 */
export class EventBudgetResponse {
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
