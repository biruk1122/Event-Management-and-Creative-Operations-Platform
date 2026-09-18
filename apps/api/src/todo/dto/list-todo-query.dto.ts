import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, Matches } from "class-validator";

import {
  TodoPriority,
  TodoStatus,
  TodoType,
} from "../../generated/prisma/client.js";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class ListTodoQueryDto {
  @ApiPropertyOptional({ enum: TodoStatus })
  @IsOptional()
  @IsEnum(TodoStatus)
  status?: TodoStatus;

  @ApiPropertyOptional({ enum: TodoType })
  @IsOptional()
  @IsEnum(TodoType)
  type?: TodoType;

  @ApiPropertyOptional({ enum: TodoPriority })
  @IsOptional()
  @IsEnum(TodoPriority)
  priority?: TodoPriority;

  @ApiPropertyOptional({
    type: String,
    example: "2026-10-01",
    description: "Inclusive lower bound on dueDate.",
  })
  @IsOptional()
  @Matches(DATE_ONLY, {
    message: "dueFrom must be an ISO 8601 date (YYYY-MM-DD)",
  })
  dueFrom?: string;

  @ApiPropertyOptional({
    type: String,
    example: "2026-10-31",
    description: "Inclusive upper bound on dueDate.",
  })
  @IsOptional()
  @Matches(DATE_ONLY, {
    message: "dueTo must be an ISO 8601 date (YYYY-MM-DD)",
  })
  dueTo?: string;
}
