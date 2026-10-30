"use client";

import { TodoItemRow } from "./todo-item";
import { CalendarDays, CircleCheck, Clock3, ListTodo, Sun } from "lucide-react";
import styles from "./todo-presentation.module.css";
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
  today: string;
  layout: "list" | "grid";
  filtered: boolean;
  statusBusy: boolean;
  relatedLabel: (item: TodoItem) => string | undefined;
}

export function TodoList({
  items,
  view,
  onSelect,
  onToggleStatus,
  today,
  layout,
  filtered,
  statusBusy,
  relatedLabel,
}: TodoListProps) {
  if (items.length === 0) {
    return (
      <p
        role="status"
        className="border-border text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm"
      >
        {filtered
          ? "No matching to-dos. Try another search or priority."
          : EMPTY_MESSAGES[view]}
      </p>
    );
  }
  const active = items.filter((item) => item.status !== "COMPLETED");
  const groups = [
    {
      key: "overdue",
      label: "Overdue",
      Icon: Clock3,
      items: active.filter(
        (item) => item.dueDate !== null && item.dueDate < today,
      ),
    },
    {
      key: "today",
      label: "Today",
      Icon: Sun,
      items: active.filter((item) => item.dueDate === today),
    },
    {
      key: "upcoming",
      label: "Upcoming",
      Icon: CalendarDays,
      items: active.filter(
        (item) => item.dueDate !== null && item.dueDate > today,
      ),
    },
    {
      key: "undated",
      label: "No due date",
      Icon: ListTodo,
      items: active.filter((item) => item.dueDate === null),
    },
    {
      key: "completed",
      label: "Completed",
      Icon: CircleCheck,
      items: items.filter((item) => item.status === "COMPLETED"),
    },
  ];
  return (
    <div className={styles.groups} data-layout={layout}>
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <section key={group.key} aria-label={`${group.label} to-dos`}>
            <h2 className={styles.groupHeading}>
              <group.Icon aria-hidden="true" />
              {group.label}
              <span>({group.items.length})</span>
            </h2>
            <ol
              aria-label={`${TODO_SMART_VIEW_LABELS[view]} — ${group.label} to-dos`}
              className={styles.rows}
            >
              {group.items.map((item) => (
                <TodoItemRow
                  key={item.id}
                  item={item}
                  onSelect={onSelect}
                  onToggleStatus={onToggleStatus}
                  today={today}
                  statusBusy={statusBusy}
                  relatedLabel={relatedLabel(item)}
                />
              ))}
            </ol>
          </section>
        ))}
    </div>
  );
}
