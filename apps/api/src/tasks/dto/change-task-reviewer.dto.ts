import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

/**
 * Super Admin's deliberate, reason-required change of a task's designated
 * reviewer. Reassignment never does this implicitly.
 */
export class ChangeTaskReviewerDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  reviewerId!: string;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(/\S/, { message: "reason must not be blank" })
  reason!: string;
}
