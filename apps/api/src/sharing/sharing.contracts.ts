import { ApiProperty } from "@nestjs/swagger";

import { ShareScope } from "../generated/prisma/client.js";

/**
 * A share grant on one letter or document (EMP-02) - the separate,
 * recipient-facing access path, independent of `letter.*`/`document.*`
 * management authorization. Exactly one of `letterId`/`documentId` is set,
 * and exactly one of `recipientId`/`allEmployees` describes the audience -
 * mirrors the two CHECK constraints on the `shares` table.
 */
export class ShareResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  letterId!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  documentId!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  recipientId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  recipientName!: string | null;

  @ApiProperty()
  allEmployees!: boolean;

  @ApiProperty({ enum: ShareScope })
  scope!: ShareScope;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  sharedById!: string | null;

  @ApiProperty({ type: String, nullable: true })
  sharedByName!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  revokedAt!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  revokedById!: string | null;

  @ApiProperty({ type: String, nullable: true })
  revokedByName!: string | null;
}

export class ShareRecipientOption {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;
}
