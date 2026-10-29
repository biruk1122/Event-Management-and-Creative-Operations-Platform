import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

import { DocumentType } from "../../generated/prisma/client.js";

/**
 * Edits a document's rename/type-change/description/project-assignment
 * fields. `sourceLetterId` and the file itself are never editable here - a
 * letter-sourced document's `documentType` is also rejected by
 * `DocumentsService` if it would move away from `LETTER` (service-layer
 * invariant, not expressible as a DTO shape).
 */
export class UpdateDocumentDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName?: string;

  @ApiPropertyOptional({ enum: DocumentType })
  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;

  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @IsOptional()
  @ValidateIf((_dto: UpdateDocumentDto, value: unknown) => value !== null)
  @IsUUID()
  projectId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @ValidateIf((_dto: UpdateDocumentDto, value: unknown) => value !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
