import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const NOT_BLANK = /\S/;

export class CreateLeaveGrantDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  leaveTypeId!: string;

  @ApiProperty({
    description: "Valid for exactly two years from the grant date.",
    minimum: 1,
    maximum: 365,
  })
  @IsInt()
  @Min(1)
  @Max(365)
  grantedDays!: number;

  @ApiPropertyOptional({ minLength: 1, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Matches(NOT_BLANK, { message: "note must not be blank" })
  note?: string;
}
