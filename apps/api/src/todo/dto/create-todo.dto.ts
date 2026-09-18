import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
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

export class CreateTodoDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @Matches(NOT_BLANK, { message: "title must not be blank" })
  title!: string;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 10_000 })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  @Matches(NOT_BLANK, { message: "description must not be blank" })
  description?: string;

  @ApiPropertyOptional({ enum: TodoType, default: TodoType.PERSONAL })
  @IsOptional()
  @IsEnum(TodoType)
  type?: TodoType;

  @ApiPropertyOptional({ enum: TodoPriority, default: TodoPriority.MEDIUM })
  @IsOptional()
  @IsEnum(TodoPriority)
  priority?: TodoPriority;

  @ApiPropertyOptional({ enum: TodoStatus, default: TodoStatus.NOT_STARTED })
  @IsOptional()
  @IsEnum(TodoStatus)
  status?: TodoStatus;

  @ApiPropertyOptional({ type: String, example: "2026-10-01" })
  @IsOptional()
  @Matches(DATE_ONLY, {
    message: "dueDate must be an ISO 8601 date (YYYY-MM-DD)",
  })
  dueDate?: string;

  @ApiPropertyOptional({ type: String, example: "09:30:00" })
  @IsOptional()
  @Matches(TIME_ONLY, {
    message: "dueTime must be an ISO 8601 time (HH:mm or HH:mm:ss)",
  })
  dueTime?: string;

  @ApiPropertyOptional({ type: String, format: "uuid" })
  @IsOptional()
  @IsUUID()
  relatedEventId?: string;

  @ApiPropertyOptional({ type: String, format: "uuid" })
  @IsOptional()
  @IsUUID()
  relatedProjectId?: string;

  @ApiPropertyOptional({
    type: String,
    format: "date-time",
    description: "Schedules a single reminder for this to-do.",
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  reminderAt?: string;
}
