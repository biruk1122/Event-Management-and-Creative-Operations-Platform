import { ApiProperty } from "@nestjs/swagger";

import { LetterCategory, LetterDirection } from "../generated/prisma/client.js";

/**
 * Administration correspondence (Letters). Only ever returned to the two
 * authorized actors (Super Admin, or the HR & Executive Officer
 * department's own manager) - `LettersService` enforces this before any
 * record reaches here. `referenceNumber` is server-generated and immutable.
 */
export class LetterResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "LELA-CAST-2026-001" })
  referenceNumber!: string;

  @ApiProperty({ enum: LetterDirection })
  direction!: LetterDirection;

  @ApiProperty({ enum: LetterCategory })
  category!: LetterCategory;

  @ApiProperty({ type: String, format: "date" })
  date!: string;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  projectId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  projectName!: string | null;

  @ApiProperty()
  subject!: string;

  @ApiProperty({ type: String, nullable: true })
  fromParty!: string | null;

  @ApiProperty({ type: String, nullable: true })
  toParty!: string | null;

  @ApiProperty({ type: String, nullable: true })
  senderReferenceNumber!: string | null;

  @ApiProperty({ type: String, nullable: true })
  shortDescription!: string | null;

  @ApiProperty({ type: String, nullable: true })
  remark!: string | null;

  @ApiProperty({
    example: 2,
    description: "Attachment count only - never full attachment contents.",
  })
  attachmentCount!: number;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  createdById!: string | null;

  @ApiProperty({ type: String, nullable: true })
  createdByName!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  updatedById!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

export class PaginatedLettersResponse {
  @ApiProperty({ type: [LetterResponse] })
  items!: LetterResponse[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({ example: 7 })
  total!: number;
}

export class LetterRemarkResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  letterId!: string;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  authorId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  authorName!: string | null;

  @ApiProperty()
  body!: string;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}

export class LetterReferencePreviewResponse {
  @ApiProperty({
    example: "LELA-CAST-2026-002",
    description:
      "Non-reserving preview of the next number. Assigned for real only when the letter is created.",
  })
  referenceNumber!: string;
}

export class LetterProjectOption {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class LetterOptionsResponse {
  @ApiProperty({ type: [LetterProjectOption] })
  projects!: LetterProjectOption[];

  @ApiProperty({ enum: LetterCategory, isArray: true })
  categories!: LetterCategory[];

  @ApiProperty({ enum: LetterDirection, isArray: true })
  directions!: LetterDirection[];
}
