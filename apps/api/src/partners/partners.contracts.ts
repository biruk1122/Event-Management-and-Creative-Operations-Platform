import { ApiProperty } from "@nestjs/swagger";

import { PartnerStatus } from "../generated/prisma/client.js";

/** A user attached to a partner as its owner or creator. */
export class PartnerPersonSummary {
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

/**
 * A sponsor, media organization, brand, or strategic-partner relationship
 * under development (Marketing Department Workspace). Distinct from a
 * `Supplier`: a Partner is a commercial opportunity being built, not a
 * billed vendor. Scoped to a department (e.g. Marketing) the same way every
 * other department-owned resource is; a Team Member sees only the
 * relationships they own.
 */
export class PartnerResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Northbridge Media Group" })
  organizationName!: string;

  @ApiProperty({ example: "Media" })
  category!: string;

  @ApiProperty({ type: String, nullable: true })
  contactName!: string | null;

  @ApiProperty({ type: String, nullable: true, format: "email" })
  contactEmail!: string | null;

  @ApiProperty({ type: String, nullable: true })
  contactPhone!: string | null;

  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description: "The department that owns this relationship (e.g. Marketing).",
  })
  departmentId!: string | null;

  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description: "The campaign this opportunity relates to, where applicable.",
  })
  campaignId!: string | null;

  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description: "The event this opportunity relates to, where applicable.",
  })
  eventId!: string | null;

  @ApiProperty({ enum: PartnerStatus })
  status!: PartnerStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    example: "Co-branded media placement, estimated 5,000 ETB in kind",
  })
  proposedContribution!: string | null;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty({
    type: String,
    format: "date-time",
    nullable: true,
    description: "When this relationship next needs a follow-up.",
  })
  followUpAt!: string | null;

  @ApiProperty({
    type: PartnerPersonSummary,
    nullable: true,
    description: "The user responsible for this relationship.",
  })
  owner!: PartnerPersonSummary | null;

  @ApiProperty({ type: PartnerPersonSummary, nullable: true })
  createdBy!: PartnerPersonSummary | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

export class PaginatedPartnersResponse {
  @ApiProperty({ type: [PartnerResponse] })
  items!: PartnerResponse[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({ example: 7 })
  total!: number;
}

/** Append-only discussion/communication-history entry for one partner. */
export class PartnerActivityResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  partnerId!: string;

  @ApiProperty({
    type: PartnerPersonSummary,
    nullable: true,
    description: "Null once the authoring user is gone.",
  })
  author!: PartnerPersonSummary | null;

  @ApiProperty({ example: "Sent the sponsorship deck; awaiting reply." })
  note!: string;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}

export class PaginatedPartnerActivitiesResponse {
  @ApiProperty({ type: [PartnerActivityResponse] })
  items!: PartnerActivityResponse[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({ example: 4 })
  total!: number;
}
