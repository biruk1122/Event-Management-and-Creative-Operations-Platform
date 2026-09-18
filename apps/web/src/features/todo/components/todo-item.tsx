"use client";

import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { formatDueDate } from "../lib/todo-date";
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
}

export function TodoItemRow({
  item,
  onSelect,
  onToggleStatus,
}: TodoItemRowProps) {
  const completed = item.status === "COMPLETED";
  return (
    <li className="border-border flex items-start gap-3 rounded-lg border p-3">
      <Button
        type="button"
        size="icon-xs"
        variant={completed ? "default" : "outline"}
        className="mt-0.5 shrink-0 rounded-full"
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
        className="focus-visible:ring-ring flex-1 rounded-md text-left focus-visible:ring-2 focus-visible:outline-none"
        onClick={() => onSelect(item)}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`font-medium ${completed ? "text-muted-foreground line-through" : ""}`}
          >
            {item.title}
          </span>
          <Badge variant={PRIORITY_VARIANT[item.priority]}>
            {TODO_PRIORITY_LABELS[item.priority]}
          </Badge>
          <Badge variant="outline">{TODO_TYPE_LABELS[item.type]}</Badge>
        </div>
        {item.dueDate ? (
          <p className="text-muted-foreground mt-1 text-sm">
            Due {formatDueDate(item.dueDate, item.dueTime)}
          </p>
        ) : null}
      </button>
    </li>
  );
}
