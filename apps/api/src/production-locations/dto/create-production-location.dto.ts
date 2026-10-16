import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import { ProductionLocationStatus } from "../../generated/prisma/client.js";

const NOT_BLANK = /\S/;

export class CreateProductionLocationDto {
  @ApiProperty({ example: "Riverside Studio", minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "name must not be blank" })
  name!: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  @Matches(NOT_BLANK, { message: "address must not be blank" })
  address?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(NOT_BLANK, { message: "description must not be blank" })
  description?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "contactName must not be blank" })
  contactName?: string;

  @ApiPropertyOptional({ format: "email" })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Matches(NOT_BLANK, { message: "contactPhone must not be blank" })
  contactPhone?: string;

  @ApiPropertyOptional({
    enum: ProductionLocationStatus,
    default: ProductionLocationStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(ProductionLocationStatus)
  status?: ProductionLocationStatus;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(NOT_BLANK, { message: "notes must not be blank" })
  notes?: string;
}
