import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

const NOT_BLANK = /\S/;

export class CreateSupplierDto {
  @ApiProperty({
    example: "Grand Hall Catering Co.",
    minLength: 1,
    maxLength: 200,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "name must not be blank" })
  name!: string;

  @ApiPropertyOptional({ example: "Catering", maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(NOT_BLANK, { message: "category must not be blank" })
  category?: string;

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

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(NOT_BLANK, { message: "notes must not be blank" })
  notes?: string;
}
