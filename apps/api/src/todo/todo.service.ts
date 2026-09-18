import { Injectable } from "@nestjs/common";

import {
  TodoPriority,
  TodoStatus,
  TodoType,
  type PermissionScope,
} from "../generated/prisma/client.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import type { TodoFeedResponse, TodoResponse } from "./todo.contracts.js";
import {
  todoNotFound,
  todoRelatedEventNotFound,
  todoRelatedProjectNotFound,
  todoScheduleInvalid,
} from "./todo.errors.js";
import type { CreateTodoDto } from "./dto/create-todo.dto.js";
import type { ListTodoQueryDto } from "./dto/list-todo-query.dto.js";
import type { UpdateTodoDto } from "./dto/update-todo.dto.js";
import {
  TodoRepository,
  type TodoRecord,
} from "./infrastructure/todo.repository.js";

/** A bare `YYYY-MM-DD` parses as UTC midnight per the ECMAScript Date
 * grammar - exactly how Prisma's driver adapter round-trips `@db.Date`. */
function parseDueDate(value: string): Date {
  return new Date(value);
}

/** Anchors a bare `HH:mm[:ss]` to the Unix epoch, matching how Prisma's
 * driver adapter round-trips `@db.Time` (verified against a real database:
 * the value comes back as `1970-01-01T HH:mm:ss.000Z`). */
function parseDueTime(value: string): Date {
  const withSeconds = value.length === 5 ? `${value}:00` : value;
  return new Date(`1970-01-01T${withSeconds}.000Z`);
}

@Injectable()
export class TodoService {
  constructor(
    private readonly repository: TodoRepository,
    private readonly permissions: PermissionsService,
  ) {}

  private async requireGrant(
    actingUserId: string,
    permissionKey: string,
    scope: PermissionScope = "SELF",
  ): Promise<void> {
    if (
      !(await this.permissions.hasGrant(actingUserId, permissionKey, scope))
    ) {
      throw permissionDenied();
    }
  }

  private async assertRelatedRecordsExist(
    relatedEventId: string | undefined,
    relatedProjectId: string | undefined,
  ): Promise<void> {
    if (relatedEventId !== undefined) {
      if (!(await this.repository.eventExists(relatedEventId))) {
        throw todoRelatedEventNotFound();
      }
    }
    if (relatedProjectId !== undefined) {
      if (!(await this.repository.projectExists(relatedProjectId))) {
        throw todoRelatedProjectNotFound();
      }
    }
  }

  async list(
    actingUserId: string,
    query: ListTodoQueryDto,
  ): Promise<TodoFeedResponse> {
    await this.requireGrant(actingUserId, "todo.read");
    const items = await this.repository.list({
      userId: actingUserId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.dueFrom ? { dueFrom: parseDueDate(query.dueFrom) } : {}),
      ...(query.dueTo ? { dueTo: parseDueDate(query.dueTo) } : {}),
    });
    return { items: items.map(toTodoResponse) };
  }

  async get(actingUserId: string, id: string): Promise<TodoResponse> {
    await this.requireGrant(actingUserId, "todo.read");
    const todo = await this.repository.findOwned(id, actingUserId);
    if (!todo) throw todoNotFound();
    return toTodoResponse(todo);
  }

  async create(
    actingUserId: string,
    dto: CreateTodoDto,
  ): Promise<TodoResponse> {
    await this.requireGrant(actingUserId, "todo.create");
    const dueDate =
      dto.dueDate !== undefined ? parseDueDate(dto.dueDate) : undefined;
    const dueTime =
      dto.dueTime !== undefined ? parseDueTime(dto.dueTime) : undefined;
    if (dueTime !== undefined && dueDate === undefined)
      throw todoScheduleInvalid();
    await this.assertRelatedRecordsExist(
      dto.relatedEventId,
      dto.relatedProjectId,
    );

    const todo = await this.repository.create({
      userId: actingUserId,
      title: dto.title.trim(),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
      type: dto.type ?? TodoType.PERSONAL,
      priority: dto.priority ?? TodoPriority.MEDIUM,
      status: dto.status ?? TodoStatus.NOT_STARTED,
      ...(dueDate !== undefined ? { dueDate } : {}),
      ...(dueTime !== undefined ? { dueTime } : {}),
      ...(dto.relatedEventId !== undefined
        ? { relatedEventId: dto.relatedEventId }
        : {}),
      ...(dto.relatedProjectId !== undefined
        ? { relatedProjectId: dto.relatedProjectId }
        : {}),
      ...(dto.reminderAt !== undefined
        ? { reminderAt: new Date(dto.reminderAt) }
        : {}),
    });
    return toTodoResponse(todo);
  }

  async update(
    actingUserId: string,
    id: string,
    dto: UpdateTodoDto,
  ): Promise<TodoResponse> {
    await this.requireGrant(actingUserId, "todo.update");
    const current = await this.repository.findOwned(id, actingUserId);
    if (!current) throw todoNotFound();

    const nextDueDate =
      dto.dueDate === undefined
        ? current.dueDate
        : dto.dueDate === null
          ? null
          : parseDueDate(dto.dueDate);
    const nextDueTime =
      dto.dueTime === undefined
        ? current.dueTime
        : dto.dueTime === null
          ? null
          : parseDueTime(dto.dueTime);
    if (nextDueTime && !nextDueDate) throw todoScheduleInvalid();

    await this.assertRelatedRecordsExist(
      dto.relatedEventId ?? undefined,
      dto.relatedProjectId ?? undefined,
    );

    const todo = await this.repository.updateOwned(
      id,
      actingUserId,
      {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? {
              description:
                dto.description === null ? null : dto.description.trim(),
            }
          : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: nextDueDate } : {}),
        ...(dto.dueTime !== undefined ? { dueTime: nextDueTime } : {}),
        ...(dto.relatedEventId !== undefined
          ? { relatedEventId: dto.relatedEventId }
          : {}),
        ...(dto.relatedProjectId !== undefined
          ? { relatedProjectId: dto.relatedProjectId }
          : {}),
      },
      dto.reminderAt === undefined
        ? undefined
        : dto.reminderAt === null
          ? null
          : new Date(dto.reminderAt),
    );
    if (!todo) throw todoNotFound();
    return toTodoResponse(todo);
  }

  async remove(actingUserId: string, id: string): Promise<void> {
    await this.requireGrant(actingUserId, "todo.delete");
    if (!(await this.repository.deleteOwned(id, actingUserId))) {
      throw todoNotFound();
    }
  }
}

function formatDueDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

function formatDueTime(date: Date | null): string | null {
  return date ? date.toISOString().slice(11, 19) : null;
}

function toTodoResponse(todo: TodoRecord): TodoResponse {
  const reminder = todo.reminders[0] ?? null;
  return {
    id: todo.id,
    title: todo.title,
    description: todo.description,
    type: todo.type,
    priority: todo.priority,
    status: todo.status,
    dueDate: formatDueDate(todo.dueDate),
    dueTime: formatDueTime(todo.dueTime),
    relatedEventId: todo.relatedEventId,
    relatedProjectId: todo.relatedProjectId,
    reminderEnabled: todo.reminderEnabled,
    reminderAt: reminder ? reminder.reminderAt.toISOString() : null,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
  };
}
