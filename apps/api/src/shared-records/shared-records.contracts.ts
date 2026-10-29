import { ApiProperty } from "@nestjs/swagger";

import { ShareScope } from "../generated/prisma/client.js";
import { DocumentResponse } from "../documents/documents.contracts.js";
import { LetterResponse } from "../letters/letters.contracts.js";

export class PaginatedSharedLettersResponse {
  @ApiProperty({ type: [LetterResponse] })
  items!: LetterResponse[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({ example: 7 })
  total!: number;
}

export class PaginatedSharedDocumentsResponse {
  @ApiProperty({ type: [DocumentResponse] })
  items!: DocumentResponse[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  pageSize!: number;

  @ApiProperty({ example: 7 })
  total!: number;
}

/**
 * A letter opened from the shared-with-me surface - `shareScope` is the
 * caller's own current access level (re-resolved fresh, never cached from
 * the list view), so the frontend knows whether to offer a download.
 */
export class SharedLetterResponse extends LetterResponse {
  @ApiProperty({ enum: ShareScope })
  shareScope!: ShareScope;
}

export class SharedDocumentResponse extends DocumentResponse {
  @ApiProperty({ enum: ShareScope })
  shareScope!: ShareScope;
}
