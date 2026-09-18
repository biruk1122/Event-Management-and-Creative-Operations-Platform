import type {
  TodoItem,
  TodoPriority,
  TodoStatus,
  TodoType,
} from "./todo-types";

/** The fields the single create/edit dialog collects. */
export interface TodoFormValues {
  title: string;
  description: string;
  type: TodoType;
  priority: TodoPriority;
  status: TodoStatus;
  /** "YYYY-MM-DD", or empty for none. */
  dueDate: string;
  /** "HH:mm", or empty for none. Never meaningful without `dueDate`. */
  dueTime: string;
  /** A `RelatedOption.id`, or empty for none. */
  relatedEventId: string;
  /** A `RelatedOption.id`, or empty for none. */
  relatedProjectId: string;
  remindMe: boolean;
  /** `datetime-local` value, required when `remindMe` is true. */
  reminderAt: string;
}

type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** Result of `POST /todos`. */
export type CreateTodoOutcome =
  | { status: "success"; item: TodoItem }
  | { status: "schedule_invalid" }
  | { status: "related_event_not_found" }
  | { status: "related_project_not_found" }
  | { status: "field_errors"; fieldErrors: FieldErrors<keyof TodoFormValues> }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type CreateTodo = (values: TodoFormValues) => Promise<CreateTodoOutcome>;

/** Result of `PATCH /todos/:id`. */
export type UpdateTodoOutcome =
  | { status: "success"; item: TodoItem }
  | { status: "schedule_invalid" }
  | { status: "related_event_not_found" }
  | { status: "related_project_not_found" }
  | { status: "field_errors"; fieldErrors: FieldErrors<keyof TodoFormValues> }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type UpdateTodo = (
  id: string,
  values: TodoFormValues,
) => Promise<UpdateTodoOutcome>;

/** Result of `DELETE /todos/:id`. */
export type DeleteTodoOutcome =
  | { status: "success" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type DeleteTodo = (id: string) => Promise<DeleteTodoOutcome>;
