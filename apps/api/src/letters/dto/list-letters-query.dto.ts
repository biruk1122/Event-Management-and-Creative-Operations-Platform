import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import {
  LetterCategory,
  LetterDirection,
} from "../../generated/prisma/client.js";

export const LETTER_SORT_FIELDS = [
  "date",
  "referenceNumber",
  "subject",
] as const;
export type LetterSortField = (typeof LETTER_SORT_FIELDS)[number];

export class ListLettersQueryDto {
  @ApiPropertyOptional({ enum: LetterDirection })
  @IsOptional()
  @IsEnum(LetterDirection)
  direction?: LetterDirection;

  @ApiPropertyOptional({ enum: LetterCategory })
  @IsOptional()
  @IsEnum(LetterCategory)
  category?: LetterCategory;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({
    description:
      "Matches reference number, subject, from/to party, project name, or sender's reference number.",
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: LETTER_SORT_FIELDS, default: "date" })
  @IsOptional()
  @IsIn(LETTER_SORT_FIELDS)
  sort: LetterSortField = "date";

  @ApiPropertyOptional({ enum: ["asc", "desc"], default: "desc" })
  @IsOptional()
  @IsIn(["asc", "desc"])
  order: "asc" | "desc" = "desc";

  @ApiPropertyOptional({ minimum: 1, maximum: 100000, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}
