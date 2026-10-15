import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

import { ProductionLocationStatus } from "../../generated/prisma/client.js";

const NOT_BLANK = /\S/;

export class UpdateProductionLocationDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "name must not be blank" })
  name?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 300 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(300)
  @Matches(NOT_BLANK, { message: "address must not be blank" })
  address?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  @Matches(NOT_BLANK, { message: "description must not be blank" })
  description?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "contactName must not be blank" })
  contactName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: "email" })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEmail()
  contactEmail?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 50 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(50)
  @Matches(NOT_BLANK, { message: "contactPhone must not be blank" })
  contactPhone?: string | null;

  @ApiPropertyOptional({ enum: ProductionLocationStatus })
  @IsOptional()
  @IsEnum(ProductionLocationStatus)
  status?: ProductionLocationStatus;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  @Matches(NOT_BLANK, { message: "notes must not be blank" })
  notes?: string | null;
}
