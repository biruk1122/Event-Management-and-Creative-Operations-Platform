import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
const NOT_BLANK = /\S/;
export class CreateProductionDto {
  @ApiProperty({ example: "Launch film", maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK)
  name!: string;
  @ApiProperty({ example: "Video", maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(NOT_BLANK)
  productionType!: string;
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  startAt?: string;
  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  endAt?: string;
  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  deadlineAt?: string;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  managerId?: string;
}
