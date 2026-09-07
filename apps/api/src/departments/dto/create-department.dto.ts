import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateDepartmentDto {
  @ApiProperty({ example: "Event Management", minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    example: "Owns planning and delivery for all events.",
    minLength: 1,
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
    description: "Assign this user as the department manager on creation.",
  })
  @IsOptional()
  @IsUUID()
  managerId?: string;
}
