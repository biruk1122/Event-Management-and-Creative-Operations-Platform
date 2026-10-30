import { ApiProperty } from "@nestjs/swagger";

import { DocumentType } from "../generated/prisma/client.js";

/**
 * Document metadata (EMP-02). Only ever returned to the two authorized
 * actors (Super Admin, or the HR & Executive Officer department's own
 * manager) - `DocumentsService` enforces this before any record reaches
 * here. `fileId` is the file's own id (needed to build the download route,
 * which is file-id-addressed like every other attachment surface in this
 * app); `fileAvailable`/`originalFilename`/`sizeBytes`/`uploadedAt` are the
 * rest of the derived view of the linked `ManagedFile`.
 */
export class DocumentResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty({ enum: DocumentType })
  documentType!: DocumentType;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  projectId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  projectName!: string | null;

  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description:
      "Set only when this document originated from a letter attachment.",
  })
  sourceLetterId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  sourceLetterReferenceNumber!: string | null;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  uploadedById!: string | null;

  @ApiProperty({ type: String, nullable: true })
  uploadedByName!: string | null;

  @ApiProperty({
    description: "Whether a file has been uploaded and finalized yet.",
  })
  fileAvailable!: boolean;

  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description:
      "The attached file's id, for the download route. Null until a file is attached.",
  })
  fileId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  originalFilename!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  sizeBytes!: number | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  uploadedAt!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

export class PaginatedDocumentsResponse {
  @ApiProperty({ type: [DocumentResponse] })
  items!: DocumentResponse[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({ example: 7 })
  total!: number;
}

export class DocumentProjectOption {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class DocumentOptionsResponse {
  @ApiProperty({ type: [DocumentProjectOption] })
  projects!: DocumentProjectOption[];

  @ApiProperty({ enum: DocumentType, isArray: true })
  types!: DocumentType[];
}
