import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
export class UpdateProductionDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/\S/)
  name?: string;
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/)
  productionType?: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;
  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsISO8601({ strict: true })
  startAt?: string | null;
  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsISO8601({ strict: true })
  endAt?: string | null;
  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsISO8601({ strict: true })
  deadlineAt?: string | null;
}
