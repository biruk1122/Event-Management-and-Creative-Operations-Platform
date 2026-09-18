"use client";

import { useMemo, useState } from "react";

import {
  TodoDialog,
  type TodoFormOutcome,
  type TodoFormValues,
} from "./todo-dialog";
import { TodoList } from "./todo-list";
import { TodoToolbar } from "./todo-toolbar";
import { todayDateOnly } from "../lib/todo-date";
import {
  todoFixtures,
  todoRelatedEventOptions,
  todoRelatedProjectOptions,
} from "../lib/todo-fixtures";
import type { TodoItem, TodoSmartView } from "../lib/todo-types";

function isImportant(item: TodoItem): boolean {
  return item.priority === "HIGH" || item.priority === "URGENT";
}

function matchesView(
  item: TodoItem,
  view: TodoSmartView,
  today: string,
): boolean {
  switch (view) {
    case "ALL":
      return true;
    case "MY_DAY":
      return item.dueDate === today;
    case "IMPORTANT":
      return isImportant(item);
    case "UPCOMING":
      return (
        item.dueDate !== null &&
        item.dueDate > today &&
        item.status !== "COMPLETED"
      );
    case "WORK":
      return item.type === "WORK";
    case "PERSONAL":
      return item.type === "PERSONAL";
    case "COMPLETED":
      return item.status === "COMPLETED";
  }
}

function toItemFields(
  values: TodoFormValues,
): Omit<TodoItem, "id" | "createdAt" | "updatedAt"> {
  return {
    title: values.title.trim(),
    description: values.description.trim() || null,
    type: values.type,
    priority: values.priority,
    status: values.status,
    dueDate: values.dueDate || null,
    dueTime: values.dueDate && values.dueTime ? `${values.dueTime}:00` : null,
    relatedEventId: values.relatedEventId || null,
    relatedProjectId: values.relatedProjectId || null,
    reminderEnabled: values.remindMe,
    reminderAt:
      values.remindMe && values.reminderAt
        ? new Date(values.reminderAt).toISOString()
        : null,
  };
}

export interface TodoManagerProps {
  /** Testing seam: the demo data and every "today" comparison a smart view
   * makes are otherwise time-relative, which would make assertions on
   * rendered content non-deterministic. */
  initialItems?: TodoItem[];
  initialToday?: string;
}

export function TodoManager({
  initialItems,
  initialToday,
}: TodoManagerProps = {}) {
  const [items, setItems] = useState<TodoItem[]>(
    () => initialItems ?? todoFixtures(),
  );
  const [view, setView] = useState<TodoSmartView>("MY_DAY");
  const [editingItem, setEditingItem] = useState<TodoItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // TodoDialog's own form state only initializes once per mount; bumping
  // this on every open remounts it fresh instead of syncing it via an
  // effect (see that component's own doc comment).
  const [dialogInstanceKey, setDialogInstanceKey] = useState(0);
  const today = initialToday ?? todayDateOnly();

  const eventOptions = useMemo(() => todoRelatedEventOptions(), []);
  const projectOptions = useMemo(() => todoRelatedProjectOptions(), []);

  const visibleItems = useMemo(() => {
    return items
      .filter((item) => matchesView(item, view, today))
      .slice()
      .sort((a, b) => {
        // Items without a due date sort last, in this list's own view.
        if (a.dueDate === null && b.dueDate === null) return 0;
        if (a.dueDate === null) return 1;
        if (b.dueDate === null) return -1;
        if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        return (a.dueTime ?? "").localeCompare(b.dueTime ?? "");
      });
  }, [items, view, today]);

  function openCreate() {
    setEditingItem(null);
    setDialogOpen(true);
    setDialogInstanceKey((key) => key + 1);
  }

  function openEdit(item: TodoItem) {
    setEditingItem(item);
    setDialogOpen(true);
    setDialogInstanceKey((key) => key + 1);
  }

  function toggleStatus(item: TodoItem) {
    const nextStatus =
      item.status === "COMPLETED" ? "NOT_STARTED" : "COMPLETED";
    setItems((current) =>
      current.map((existing) =>
        existing.id === item.id
          ? {
              ...existing,
              status: nextStatus,
              updatedAt: new Date().toISOString(),
            }
          : existing,
      ),
    );
  }

  async function submitTodo(values: TodoFormValues): Promise<TodoFormOutcome> {
    const updatedAt = new Date().toISOString();
    if (editingItem) {
      const updated: TodoItem = {
        ...editingItem,
        ...toItemFields(values),
        updatedAt,
      };
      setItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      return { status: "success", item: updated };
    }

    const created: TodoItem = {
      id: `local-${crypto.randomUUID()}`,
      ...toItemFields(values),
      createdAt: updatedAt,
      updatedAt,
    };
    setItems((current) => [...current, created]);
    return { status: "success", item: created };
  }

  async function deleteTodo(id: string): Promise<void> {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  return (
    <div className="space-y-4">
      <TodoToolbar view={view} onChangeView={setView} onCreate={openCreate} />
      <TodoList
        items={visibleItems}
        view={view}
        onSelect={openEdit}
        onToggleStatus={toggleStatus}
      />
      <TodoDialog
        key={dialogInstanceKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editingItem}
        eventOptions={eventOptions}
        projectOptions={projectOptions}
        onSubmit={submitTodo}
        {...(editingItem ? { onDelete: deleteTodo } : {})}
      />
    </div>
  );
}
