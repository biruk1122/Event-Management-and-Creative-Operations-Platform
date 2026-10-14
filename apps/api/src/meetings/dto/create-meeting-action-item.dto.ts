import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import { TaskPriority } from "../../generated/prisma/client.js";

const NOT_BLANK = /\S/;

/**
 * Creates a real `Task` row linked back to this meeting via
 * `Task.sourceMeetingId` (EOM-01) - a thin wrapper over the existing task
 * creation flow, not a separate action-item model. The task's workspace or
 * department is resolved server-side (the meeting's own workspace if it has
 * one, otherwise the organizer's own department), never from client input.
 */
export class CreateMeetingActionItemDto {
  @ApiProperty({ example: "Confirm venue permits", maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: "title must not be blank" })
  title!: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  @Matches(NOT_BLANK, { message: "description must not be blank" })
  description?: string;

  @ApiPropertyOptional({ enum: TaskPriority, default: TaskPriority.MEDIUM })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  dueAt?: string;

  @ApiPropertyOptional({
    format: "uuid",
    description: "Assign this active user to the new task immediately.",
  })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}
