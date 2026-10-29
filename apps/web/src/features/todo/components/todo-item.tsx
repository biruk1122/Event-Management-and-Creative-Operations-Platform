"use client";

import { CalendarDays, Check, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { formatDueDate } from "../lib/todo-date";
import styles from "./todo-presentation.module.css";
import {
  TODO_PRIORITY_LABELS,
  TODO_TYPE_LABELS,
  type TodoItem,
  type TodoPriority,
} from "../lib/todo-types";

const PRIORITY_VARIANT: Record<
  TodoPriority,
  "default" | "secondary" | "outline" | "destructive"
> = {
  LOW: "outline",
  MEDIUM: "secondary",
  HIGH: "default",
  URGENT: "destructive",
};

export interface TodoItemRowProps {
  item: TodoItem;
  onSelect: (item: TodoItem) => void;
  onToggleStatus: (item: TodoItem) => void;
  today: string;
  statusBusy: boolean;
  relatedLabel: string | undefined;
}

export function TodoItemRow({
  item,
  onSelect,
  onToggleStatus,
  today,
  statusBusy,
  relatedLabel,
}: TodoItemRowProps) {
  const completed = item.status === "COMPLETED";
  const dueLabel = !item.dueDate
    ? "No due date"
    : item.dueDate === today
      ? `Today${item.dueTime ? `, ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(`${item.dueDate}T${item.dueTime}`))}` : ""}`
      : formatDueDate(item.dueDate, item.dueTime);
  return (
    <li
      data-todo-item
      data-priority={item.priority}
      data-todo-completed={completed}
      className={styles.todoRow}
    >
      <Button
        type="button"
        size="icon-xs"
        variant={completed ? "default" : "outline"}
        className={styles.completionToggle}
        data-todo-toggle-id={item.id}
        disabled={statusBusy}
        aria-pressed={completed}
        aria-label={
          completed
            ? `Mark "${item.title}" as not started`
            : `Mark "${item.title}" as completed`
        }
        onClick={(event) => {
          event.stopPropagation();
          onToggleStatus(item);
        }}
      >
        {completed ? <Check aria-hidden="true" /> : null}
      </Button>
      <button
        type="button"
        className={styles.itemMain}
        onClick={() => onSelect(item)}
      >
        <span
          className={`font-medium ${completed ? "text-muted-foreground line-through" : ""}`}
        >
          {item.title}
        </span>
        {item.description ? (
          <span className={styles.description}>{item.description}</span>
        ) : null}
      </button>
      <div className={styles.rowMeta}>
        <span>
          <Badge variant={PRIORITY_VARIANT[item.priority]}>
            {TODO_PRIORITY_LABELS[item.priority]}
          </Badge>
        </span>
        <span className={styles.dueDate}>
          <CalendarDays aria-hidden="true" />
          {dueLabel}
        </span>
        <span className={styles.category}>
          <Badge
            variant="outline"
            title={relatedLabel || TODO_TYPE_LABELS[item.type]}
          >
            {relatedLabel || TODO_TYPE_LABELS[item.type]}
          </Badge>
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className={styles.editButton}
        aria-label={`Edit "${item.title}"`}
        onClick={() => onSelect(item)}
      >
        <Pencil aria-hidden="true" />
      </Button>
    </li>
  );
}
