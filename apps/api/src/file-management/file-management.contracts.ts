import { ApiProperty } from "@nestjs/swagger";

export class UploadFormResponse {
  @ApiProperty({ example: "http://localhost:9000/event-platform-files" })
  url!: string;

  @ApiProperty({
    type: "object",
    additionalProperties: { type: "string" },
    description:
      "One-use, short-lived form fields for direct object storage upload. Do not persist them.",
  })
  fields!: Record<string, string>;
}

export class ManagedFileResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "call-sheet.pdf" })
  filename!: string;

  @ApiProperty({ example: "application/pdf" })
  mediaType!: string;

  @ApiProperty({ example: 1048576 })
  sizeBytes!: number;

  @ApiProperty({ example: "available" })
  state!: "pending" | "available";

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time", required: false })
  availableAt?: string;
}

export class UploadIntentResponse extends ManagedFileResponse {
  @ApiProperty({ format: "date-time" })
  intentExpiresAt!: string;

  @ApiProperty({ type: UploadFormResponse })
  upload!: UploadFormResponse;
}

export class PaginatedManagedFilesResponse {
  @ApiProperty({ type: ManagedFileResponse, isArray: true })
  items!: ManagedFileResponse[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 1 })
  total!: number;
}

export class DownloadGrantResponse {
  @ApiProperty({ format: "uri" })
  url!: string;

  @ApiProperty({ format: "date-time" })
  expiresAt!: string;

  @ApiProperty({ example: "application/pdf" })
  mediaType!: string;

  @ApiProperty({ example: "call-sheet.pdf" })
  filename!: string;
}
