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

import { TaskPriority, TaskType } from "../../generated/prisma/client.js";

const NOT_BLANK = /\S/;

export class CreateTaskDto {
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

  @ApiPropertyOptional({ enum: TaskType, default: TaskType.GENERAL })
  @IsOptional()
  @IsEnum(TaskType)
  type?: TaskType;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({
    format: "uuid",
    description: "A user to assign immediately on creation.",
  })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  startAt?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  dueAt?: string;
}
