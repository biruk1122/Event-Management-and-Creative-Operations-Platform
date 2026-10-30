"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  LayoutGrid,
  Lightbulb,
  List,
  Plus,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import styles from "./todo-presentation.module.css";
import {
  TodoRequestError,
  listAssignableEvents,
  listAssignableProjects,
} from "../api/todo-gateway";
import { todoKeys, useTodoMutations, useTodos } from "../api/todo-queries";
import { todayDateOnly } from "../lib/todo-date";
import type { DeleteTodoOutcome } from "../lib/todo-outcome";
import {
  TODO_PRIORITIES,
  TODO_PRIORITY_LABELS,
  TODO_SMART_VIEWS,
  type TodoItem,
  type TodoPriority,
  type TodoSmartView,
} from "../lib/todo-types";

type TodoSort = "DUE_DATE" | "PRIORITY" | "TITLE";
const PRIORITY_ORDER: Record<TodoPriority, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

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
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<TodoPriority | "ALL">("ALL");
  const [sort, setSort] = useState<TodoSort>("DUE_DATE");
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [statusError, setStatusError] = useState<string | null>(null);
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
  const surfaceRef = useRef<HTMLDivElement>(null);
  const toggleFocusRef = useRef<{ id: string; source: Element } | null>(null);
  useEffect(() => {
    const pending = toggleFocusRef.current;
    if (!pending || mutations.toggleStatus.isPending) return;
    toggleFocusRef.current = null;
    // Moving between due-date groups remounts the row. Restore its toggle
    // only when focus was lost, leaving deliberate keyboard navigation alone.
    if (
      document.activeElement !== document.body &&
      document.activeElement !== pending.source
    )
      return;
    const toggles = Array.from(
      surfaceRef.current?.querySelectorAll<HTMLButtonElement>(
        "button[data-todo-toggle-id]",
      ) ?? [],
    );
    const target =
      toggles.find((button) => button.dataset.todoToggleId === pending.id) ??
      toggles[0] ??
      surfaceRef.current?.querySelector<HTMLButtonElement>(
        '[data-work-toolbar] button[aria-pressed="true"]',
      );
    target?.focus();
  }, [feed.data, mutations.toggleStatus.isPending]);

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
  const counts = Object.fromEntries(
    TODO_SMART_VIEWS.map((candidate) => [
      candidate,
      items.filter((item) => matchesView(item, candidate, today)).length,
    ]),
  ) as Record<TodoSmartView, number>;
  const openCount = items.filter((item) => item.status !== "COMPLETED").length;
  const dueTodayCount = items.filter(
    (item) => item.status !== "COMPLETED" && item.dueDate === today,
  ).length;
  const visibleItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return items
      .filter((item) => matchesView(item, view, today))
      .filter((item) => priority === "ALL" || item.priority === priority)
      .filter(
        (item) =>
          !term ||
          `${item.title} ${item.description ?? ""}`
            .toLocaleLowerCase()
            .includes(term),
      )
      .slice()
      .sort((a, b) => {
        if (sort === "TITLE") return a.title.localeCompare(b.title);
        if (sort === "PRIORITY" && a.priority !== b.priority)
          return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        // Items without a due date sort last, in this list's own view.
        if (a.dueDate === null && b.dueDate === null) return 0;
        if (a.dueDate === null) return 1;
        if (b.dueDate === null) return -1;
        if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        return (a.dueTime ?? "").localeCompare(b.dueTime ?? "");
      });
  }, [items, view, today, search, priority, sort]);

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
    const source = document.activeElement;
    if (
      source instanceof HTMLElement &&
      source.dataset.todoToggleId === item.id
    ) {
      toggleFocusRef.current = { id: item.id, source };
    }
    setStatusError(null);
    const nextStatus =
      item.status === "COMPLETED" ? "NOT_STARTED" : "COMPLETED";
    mutations.toggleStatus.mutate(
      { id: item.id, status: nextStatus },
      {
        onSuccess: (outcome) => {
          if (outcome.status !== "success")
            setStatusError("We could not update this to-do. Please try again.");
        },
      },
    );
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
    <div ref={surfaceRef} className={`${styles.surface} space-y-4`}>
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus aria-hidden="true" />
          Add to-do
        </Button>
      </div>
      {connection.state.status === "denied" ? (
        <p role="status" className="text-muted-foreground text-sm">
          Live updates are unavailable. Refresh to see changes made elsewhere.
        </p>
      ) : connection.state.status === "reconnecting" ? (
        <p role="status" className="text-muted-foreground text-sm">
          Reconnecting…
        </p>
      ) : null}

      <TodoToolbar view={view} onChangeView={setView} counts={counts} />
      <section className={styles.content} aria-label="Your to-dos">
        <div className={styles.controls}>
          <div className={styles.search}>
            <Search aria-hidden="true" />
            <Input
              aria-label="Search to-dos"
              placeholder="Search your to-dos…"
              maxLength={500}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className={styles.filters}>
            <Select
              value={sort}
              onValueChange={(value) => setSort(value as TodoSort)}
            >
              <SelectTrigger aria-label="Sort to-dos">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DUE_DATE">Sort by: Due date</SelectItem>
                <SelectItem value="PRIORITY">Sort by: Priority</SelectItem>
                <SelectItem value="TITLE">Sort by: Title</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={priority}
              onValueChange={(value) =>
                setPriority(value as TodoPriority | "ALL")
              }
            >
              <SelectTrigger aria-label="Filter by priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All priorities</SelectItem>
                {TODO_PRIORITIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {TODO_PRIORITY_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div
              className={styles.layoutSwitch}
              role="group"
              aria-label="To-do layout"
            >
              <Button
                size="icon"
                variant={layout === "list" ? "default" : "ghost"}
                aria-label="List layout"
                aria-pressed={layout === "list"}
                onClick={() => setLayout("list")}
              >
                <List aria-hidden="true" />
              </Button>
              <Button
                size="icon"
                variant={layout === "grid" ? "default" : "ghost"}
                aria-label="Grid layout"
                aria-pressed={layout === "grid"}
                onClick={() => setLayout("grid")}
              >
                <LayoutGrid aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
        {statusError ? <p role="alert">{statusError}</p> : null}
        <TodoList
          items={visibleItems}
          view={view}
          onSelect={openEdit}
          onToggleStatus={toggleStatus}
          today={today}
          layout={layout}
          filtered={search.trim() !== "" || priority !== "ALL"}
          statusBusy={mutations.toggleStatus.isPending}
          relatedLabel={(item) =>
            projectOptions.find((option) => option.id === item.relatedProjectId)
              ?.name ??
            eventOptions.find((option) => option.id === item.relatedEventId)
              ?.name
          }
        />
        <footer className={styles.summary}>
          <p>
            <Lightbulb aria-hidden="true" />
            You have {openCount} open to-dos.{" "}
            <strong>{dueTodayCount} due today.</strong>
          </p>
          <Button
            variant="link"
            onClick={() => {
              setView("ALL");
              setSearch("");
              setPriority("ALL");
            }}
          >
            View all to-dos
            <ArrowRight aria-hidden="true" />
          </Button>
        </footer>
      </section>
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
