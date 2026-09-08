import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

/** Rejects a value that is empty once trimmed, matching the database CHECKs. */
const NOT_BLANK = /\S/;

export class CreateTeamDto {
  @ApiProperty({ example: "Production Team", minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(NOT_BLANK, { message: "name must not be blank" })
  name!: string;

  @ApiProperty({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
    description: "The department that owns this team. Required and immutable.",
  })
  @IsUUID()
  departmentId!: string;

  @ApiPropertyOptional({
    example: "Delivers production for events and campaigns.",
    minLength: 1,
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Matches(NOT_BLANK, { message: "description must not be blank" })
  description?: string;

  @ApiPropertyOptional({
    format: "uuid",
    example: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
    description: "Assign this user as the team manager on creation.",
  })
  @IsOptional()
  @IsUUID()
  managerId?: string;
}
