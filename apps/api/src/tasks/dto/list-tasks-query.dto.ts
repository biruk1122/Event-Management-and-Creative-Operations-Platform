import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import { TaskPriority, TaskStatus } from "../../generated/prisma/client.js";

export enum TaskSort {
  UPDATED = "UPDATED",
  DUE_AT = "DUE_AT",
  START_AT = "START_AT",
}

export class ListTasksQueryDto {
  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TaskPriority })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  scheduledFrom?: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  scheduledTo?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: "Only overdue open tasks.",
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({ enum: TaskSort, default: TaskSort.UPDATED })
  @IsOptional()
  @IsEnum(TaskSort)
  sort: TaskSort = TaskSort.UPDATED;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}
