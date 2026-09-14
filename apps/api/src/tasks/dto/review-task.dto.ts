import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import { TaskReviewOutcome } from "../../generated/prisma/client.js";

export class ReviewTaskDto {
  @ApiProperty({ enum: TaskReviewOutcome })
  @IsEnum(TaskReviewOutcome)
  outcome!: TaskReviewOutcome;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(/\S/, { message: "note must not be blank" })
  note?: string;
}
