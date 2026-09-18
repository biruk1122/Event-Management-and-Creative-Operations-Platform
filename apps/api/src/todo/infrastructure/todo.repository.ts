import { Injectable } from "@nestjs/common";

import {
  Prisma,
  TodoPriority,
  TodoStatus,
  TodoType,
} from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

export interface TodoReminderRecord {
  reminderAt: Date;
  sent: boolean;
}

export interface TodoRecord {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  type: TodoType;
  priority: TodoPriority;
  status: TodoStatus;
  dueDate: Date | null;
  dueTime: Date | null;
  relatedEventId: string | null;
  relatedProjectId: string | null;
  reminderEnabled: boolean;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  reminders: TodoReminderRecord[];
}

export interface ListTodosInput {
  userId: string;
  status?: TodoStatus;
  type?: TodoType;
  priority?: TodoPriority;
  dueFrom?: Date;
  dueTo?: Date;
}

export interface CreateTodoInput {
  userId: string;
  title: string;
  description?: string;
  type: TodoType;
  priority: TodoPriority;
  status: TodoStatus;
  dueDate?: Date;
  dueTime?: Date;
  relatedEventId?: string;
  relatedProjectId?: string;
  reminderAt?: Date;
}

export interface UpdateTodoFields {
  title?: string;
  description?: string | null;
  type?: TodoType;
  priority?: TodoPriority;
  status?: TodoStatus;
  dueDate?: Date | null;
  dueTime?: Date | null;
  relatedEventId?: string | null;
  relatedProjectId?: string | null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

const TODO_SELECT = {
  id: true,
  userId: true,
  title: true,
  description: true,
  type: true,
  priority: true,
  status: true,
  dueDate: true,
  dueTime: true,
  relatedEventId: true,
  relatedProjectId: true,
  reminderEnabled: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  // At most one reminder is ever exposed through this module's API (see
  // TodoService's replace-on-write semantics); ordering by the most recent
  // moment keeps that guarantee even if a future caller writes more than
  // one directly against the table.
  reminders: {
    select: { reminderAt: true, sent: true },
    orderBy: { reminderAt: "desc" },
    take: 1,
  },
} as const;

type RawTodo = Prisma.TodoGetPayload<{ select: typeof TODO_SELECT }>;

function toRecord(todo: RawTodo): TodoRecord {
  return todo;
}

function updateData(
  fields: UpdateTodoFields,
): Prisma.TodoUncheckedUpdateManyInput {
  // The "unchecked" input is required here (not the relation-aware
  // `UpdateManyMutationInput`) because `relatedEventId`/`relatedProjectId`
  // are relation scalar fields - `updateMany` only exposes them directly
  // through this variant.
  const data: Prisma.TodoUncheckedUpdateManyInput = {};
  if (fields.title !== undefined) data.title = fields.title;
  if (fields.description !== undefined) data.description = fields.description;
  if (fields.type !== undefined) data.type = fields.type;
  if (fields.priority !== undefined) data.priority = fields.priority;
  if (fields.status !== undefined) data.status = fields.status;
  if (fields.dueDate !== undefined) data.dueDate = fields.dueDate;
  if (fields.dueTime !== undefined) data.dueTime = fields.dueTime;
  if (fields.relatedEventId !== undefined)
    data.relatedEventId = fields.relatedEventId;
  if (fields.relatedProjectId !== undefined)
    data.relatedProjectId = fields.relatedProjectId;
  return data;
}

/** Persistence boundary for a caller's own To-Do items and their reminders. */
@Injectable()
export class TodoRepository {
  constructor(private readonly db: DatabaseService) {}

  async list(input: ListTodosInput): Promise<TodoRecord[]> {
    const todos = await this.db.todo.findMany({
      where: {
        userId: input.userId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.type ? { type: input.type } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.dueFrom || input.dueTo
          ? {
              dueDate: {
                ...(input.dueFrom ? { gte: input.dueFrom } : {}),
                ...(input.dueTo ? { lte: input.dueTo } : {}),
              },
            }
          : {}),
      },
      select: TODO_SELECT,
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    });
    return todos.map(toRecord);
  }

  async findOwned(id: string, userId: string): Promise<TodoRecord | null> {
    if (!isUuid(id)) return null;
    const todo = await this.db.todo.findFirst({
      where: { id, userId },
      select: TODO_SELECT,
    });
    return todo ? toRecord(todo) : null;
  }

  async eventExists(id: string): Promise<boolean> {
    return (
      (await this.db.event.findUnique({
        where: { id },
        select: { id: true },
      })) !== null
    );
  }

  async projectExists(id: string): Promise<boolean> {
    return (
      (await this.db.project.findUnique({
        where: { id },
        select: { id: true },
      })) !== null
    );
  }

  /** Creates the to-do and, when `reminderAt` is given, its single reminder
   * row in one transaction - a to-do with `reminderEnabled: true` and no
   * reminder row (or vice versa) is never observable. */
  async create(input: CreateTodoInput): Promise<TodoRecord> {
    return this.db.$transaction(async (tx) => {
      const todo = await tx.todo.create({
        data: {
          userId: input.userId,
          createdById: input.userId,
          title: input.title,
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          type: input.type,
          priority: input.priority,
          status: input.status,
          ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
          ...(input.dueTime !== undefined ? { dueTime: input.dueTime } : {}),
          ...(input.relatedEventId !== undefined
            ? { relatedEventId: input.relatedEventId }
            : {}),
          ...(input.relatedProjectId !== undefined
            ? { relatedProjectId: input.relatedProjectId }
            : {}),
          reminderEnabled: input.reminderAt !== undefined,
          ...(input.reminderAt !== undefined
            ? { reminders: { create: { reminderAt: input.reminderAt } } }
            : {}),
        },
        select: TODO_SELECT,
      });
      return toRecord(todo);
    });
  }

  /** Updates an owned to-do. `reminderAt === undefined` leaves the existing
   * reminder untouched; `null` clears it; a `Date` replaces it - always by
   * deleting any existing reminder rows first, preserving "at most one"
   * even though the underlying table allows more. Returns `null` if no
   * owned row matched (including a foreign owner or a missing id). */
  async updateOwned(
    id: string,
    userId: string,
    fields: UpdateTodoFields,
    reminderAt?: Date | null,
  ): Promise<TodoRecord | null> {
    if (!isUuid(id)) return null;
    return this.db.$transaction(async (tx) => {
      const result = await tx.todo.updateMany({
        where: { id, userId },
        data: updateData(fields),
      });
      if (result.count === 0) return null;

      if (reminderAt !== undefined) {
        await tx.todoReminder.deleteMany({ where: { todoId: id } });
        await tx.todo.update({
          where: { id },
          data: {
            reminderEnabled: reminderAt !== null,
            ...(reminderAt !== null
              ? { reminders: { create: { reminderAt } } }
              : {}),
          },
        });
      }

      const todo = await tx.todo.findFirst({
        where: { id, userId },
        select: TODO_SELECT,
      });
      return todo ? toRecord(todo) : null;
    });
  }

  async deleteOwned(id: string, userId: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const result = await this.db.todo.deleteMany({ where: { id, userId } });
    return result.count === 1;
  }
}
