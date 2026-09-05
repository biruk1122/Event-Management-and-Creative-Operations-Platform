import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateRoleDto {
  @ApiPropertyOptional({
    example: "Regional Coordinator",
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: "Coordinates activity across one region." })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
