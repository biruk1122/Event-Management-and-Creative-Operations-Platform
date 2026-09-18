"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import {
  useRealtimeConnection,
  type ConnectRealtime,
} from "@/features/realtime";

import {
  TodoDialog,
  type TodoFormOutcome,
  type TodoFormValues,
} from "./todo-dialog";
import { TodoList } from "./todo-list";
import { TodoToolbar } from "./todo-toolbar";
import {
  TodoRequestError,
  listAssignableEvents,
  listAssignableProjects,
} from "../api/todo-gateway";
import { todoKeys, useTodoMutations, useTodos } from "../api/todo-queries";
import { todayDateOnly } from "../lib/todo-date";
import type { DeleteTodoOutcome } from "../lib/todo-outcome";
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

export interface TodoManagerProps {
  access: CurrentAccess;
  /** Testing seam, mirroring `CalendarManagerProps.connect`; defaults to the
   * real `/realtime` handshake. */
  connect?: ConnectRealtime;
  /** Testing seam: the default is "today", which would make assertions on
   * which smart view shows an item non-deterministic. */
  initialToday?: string;
}

export function TodoManager({
  access,
  connect,
  initialToday,
}: TodoManagerProps) {
  const client = useQueryClient();
  const keys = todoKeys(access);

  const [view, setView] = useState<TodoSmartView>("MY_DAY");
  const [editingItem, setEditingItem] = useState<TodoItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // TodoDialog's own form state only initializes once per mount; bumping
  // this on every open remounts it fresh instead of syncing it via an
  // effect (see that component's own doc comment).
  const [dialogInstanceKey, setDialogInstanceKey] = useState(0);
  const today = initialToday ?? todayDateOnly();

  const reconcile = useCallback(() => {
    void client.invalidateQueries({ queryKey: keys.all });
  }, [client, keys.all]);

  // The backend has no to-do-specific live event today (only
  // `notification.invalidated` exists anywhere in this app), so there is no
  // frame worth matching here - only a reconnect's own REST refetch below is
  // authoritative for "something may have changed while disconnected."
  const connection = useRealtimeConnection(connect);

  const everConnectedRef = useRef(false);
  useEffect(() => {
    if (connection.state.status === "connected") {
      if (everConnectedRef.current) reconcile();
      everConnectedRef.current = true;
    }
  }, [connection.state.status, reconcile]);

  const feed = useTodos(access);
  const mutations = useTodoMutations(access);

  useEffect(() => {
    if (
      feed.error instanceof TodoRequestError &&
      (feed.error.status === 401 || feed.error.status === 403)
    ) {
      void client.invalidateQueries({ queryKey: accessKey });
    }
  }, [feed.error, client]);

  // Related-item pickers degrade to an empty list (rather than blocking the
  // page) when the caller cannot read events/projects or the read fails -
  // matching `listAssignableEvents`'s own resolves-to-`[]` contract.
  const eventOptionsQuery = useQuery({
    queryKey: keys.events,
    queryFn: ({ signal }) => listAssignableEvents(signal),
    retry: false,
    staleTime: 60_000,
  });
  const projectOptionsQuery = useQuery({
    queryKey: keys.projects,
    queryFn: ({ signal }) => listAssignableProjects(signal),
    retry: false,
    staleTime: 60_000,
  });
  const eventOptions = useMemo(
    () => eventOptionsQuery.data ?? [],
    [eventOptionsQuery.data],
  );
  const projectOptions = useMemo(
    () => projectOptionsQuery.data ?? [],
    [projectOptionsQuery.data],
  );

  const items = useMemo(() => feed.data ?? [], [feed.data]);
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
    mutations.toggleStatus.mutate({ id: item.id, status: nextStatus });
  }

  async function submitTodo(values: TodoFormValues): Promise<TodoFormOutcome> {
    if (editingItem) {
      return mutations.update.mutateAsync({ id: editingItem.id, values });
    }
    return mutations.create.mutateAsync(values);
  }

  async function deleteTodo(id: string): Promise<DeleteTodoOutcome> {
    return mutations.remove.mutateAsync(id);
  }

  if (feed.isPending) {
    return <p role="status">Loading your to-dos…</p>;
  }

  if (feed.isError) {
    return (
      <div role="alert" className="space-y-2">
        <p>
          {feed.error instanceof TodoRequestError
            ? feed.error.message
            : "We could not load your to-dos. Try again."}
        </p>
        <Button variant="outline" onClick={() => void feed.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {connection.state.status === "denied" ? (
        <p role="status" className="text-muted-foreground text-sm">
          Live updates are unavailable. Refresh to see changes made elsewhere.
        </p>
      ) : connection.state.status === "reconnecting" ? (
        <p role="status" className="text-muted-foreground text-sm">
          Reconnecting…
        </p>
      ) : null}

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
