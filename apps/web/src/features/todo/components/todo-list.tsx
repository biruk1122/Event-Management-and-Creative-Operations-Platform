"use client";

import { TodoItemRow } from "./todo-item";
import {
  TODO_SMART_VIEW_LABELS,
  type TodoItem,
  type TodoSmartView,
} from "../lib/todo-types";

const EMPTY_MESSAGES: Record<TodoSmartView, string> = {
  ALL: "You don't have any to-dos yet.",
  MY_DAY: "Nothing due today.",
  IMPORTANT: "No high-priority items right now.",
  UPCOMING: "Nothing coming up.",
  WORK: "No work items.",
  PERSONAL: "No personal items.",
  COMPLETED: "Nothing completed yet.",
};

export interface TodoListProps {
  items: readonly TodoItem[];
  view: TodoSmartView;
  onSelect: (item: TodoItem) => void;
  onToggleStatus: (item: TodoItem) => void;
}

export function TodoList({
  items,
  view,
  onSelect,
  onToggleStatus,
}: TodoListProps) {
  if (items.length === 0) {
    return (
      <p
        role="status"
        className="border-border text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm"
      >
        {EMPTY_MESSAGES[view]}
      </p>
    );
  }
  return (
    <ol
      aria-label={`${TODO_SMART_VIEW_LABELS[view]} to-dos`}
      className="space-y-2"
    >
      {items.map((item) => (
        <TodoItemRow
          key={item.id}
          item={item}
          onSelect={onSelect}
          onToggleStatus={onToggleStatus}
        />
      ))}
    </ol>
  );
}
