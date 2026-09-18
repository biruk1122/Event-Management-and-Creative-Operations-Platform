import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from "class-validator";

import {
  TodoPriority,
  TodoStatus,
  TodoType,
} from "../../generated/prisma/client.js";

const NOT_BLANK = /\S/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_ONLY = /^\d{2}:\d{2}(:\d{2})?$/;

export class UpdateTodoDto {
  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(NOT_BLANK, { message: "title must not be blank" })
  title?: string;

  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: 10_000,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  @Matches(NOT_BLANK, { message: "description must not be blank" })
  description?: string | null;

  @ApiPropertyOptional({ enum: TodoType })
  @IsOptional()
  @IsEnum(TodoType)
  type?: TodoType;

  @ApiPropertyOptional({ enum: TodoPriority })
  @IsOptional()
  @IsEnum(TodoPriority)
  priority?: TodoPriority;

  @ApiPropertyOptional({ enum: TodoStatus })
  @IsOptional()
  @IsEnum(TodoStatus)
  status?: TodoStatus;

  @ApiPropertyOptional({ type: String, example: "2026-10-01", nullable: true })
  @IsOptional()
  @Matches(DATE_ONLY, {
    message: "dueDate must be an ISO 8601 date (YYYY-MM-DD)",
  })
  dueDate?: string | null;

  @ApiPropertyOptional({ type: String, example: "09:30:00", nullable: true })
  @IsOptional()
  @Matches(TIME_ONLY, {
    message: "dueTime must be an ISO 8601 time (HH:mm or HH:mm:ss)",
  })
  dueTime?: string | null;

  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  relatedEventId?: string | null;

  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  relatedProjectId?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: "date-time",
    nullable: true,
    description: "Replaces this to-do's single reminder, or clears it if null.",
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  reminderAt?: string | null;
}
