"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  LayoutGrid,
  List,
  MessageSquare,
  Paperclip,
  Plus,
  Users,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  KANBAN_STATUSES,
  TASK_STATUSES,
  dateLabel,
  personName,
  scheduleLabel,
  taskPriorityLabel,
  taskStatusLabel,
  type Task,
  type TaskCollaborationPreview,
  type TaskPriority,
  type TaskStatus,
  type TaskWorkspaceData,
} from "../lib/tasks-types";

type View = "list" | "board" | "calendar";

const ALL = "ALL";

const STATUS_VARIANT: Record<
  TaskStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  TODO: "secondary",
  IN_PROGRESS: "default",
  UNDER_REVIEW: "outline",
  BLOCKED: "destructive",
  COMPLETED: "outline",
  CANCELLED: "destructive",
};

const PRIORITY_VARIANT: Record<
  TaskPriority,
  "default" | "secondary" | "outline" | "destructive"
> = {
  LOW: "secondary",
  MEDIUM: "outline",
  HIGH: "default",
  URGENT: "destructive",
};

function assigneeLabel(task: Task): string {
  if (task.assignees.length === 0) return "Unassigned";
  return task.assignees.map(personName).join(", ");
}

function taskMatches(task: Task, query: string, status: TaskStatus | null) {
  return (
    (status === null || task.status === status) &&
    (query === "" ||
      [task.title, task.description ?? "", assigneeLabel(task)]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()))
  );
}

function Progress({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label="Task progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="bg-muted h-2 min-w-20 flex-1 overflow-hidden rounded-full"
      >
        <div
          className="bg-primary h-full rounded-full"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-muted-foreground text-xs">{value}%</span>
    </div>
  );
}

function TaskCard({ task, onSelect }: { task: Task; onSelect: () => void }) {
  return (
    <article className="border-border bg-card space-y-3 rounded-xl border p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onSelect}
          className="focus-visible:ring-ring/50 rounded text-left text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
        >
          {task.title}
        </button>
        <Badge variant={PRIORITY_VARIANT[task.priority]}>
          {taskPriorityLabel(task.priority)}
        </Badge>
      </div>
      <Progress value={task.progress} />
      <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span>{scheduleLabel(task)}</span>
        <span>{assigneeLabel(task)}</span>
      </div>
    </article>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="border-border rounded-xl border border-dashed px-5 py-12 text-center">
      <p className="text-sm font-medium">
        {filtered ? "No tasks match these filters" : "No tasks yet"}
      </p>
      <p className="text-muted-foreground mt-1 text-sm">
        {filtered
          ? "Clear a filter or adjust your search to see tasks."
          : "Create a task when task actions are connected."}
      </p>
    </div>
  );
}

function ListView({
  tasks,
  onSelect,
  filtered,
}: {
  tasks: readonly Task[];
  onSelect: (task: Task) => void;
  filtered: boolean;
}) {
  if (tasks.length === 0) return <EmptyState filtered={filtered} />;
  return (
    <>
      <div className="border-border hidden overflow-x-auto rounded-xl border sm:block">
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground border-border border-b text-xs">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Task
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Progress
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Due date
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Assignees
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {tasks.map((task) => (
              <tr key={task.id} className="hover:bg-muted/50">
                <th scope="row" className="px-4 py-3 font-normal">
                  <button
                    type="button"
                    onClick={() => onSelect(task)}
                    className="focus-visible:ring-ring/50 rounded text-left font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                  >
                    {task.title}
                  </button>
                </th>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[task.status]}>
                    {taskStatusLabel(task.status)}
                  </Badge>
                </td>
                <td className="min-w-32 px-4 py-3">
                  <Progress value={task.progress} />
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {dateLabel(task.dueAt)}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {assigneeLabel(task)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul aria-label="Task list" className="space-y-3 sm:hidden">
        {tasks.map((task) => (
          <li key={task.id} className="border-border rounded-xl border p-4">
            <button
              type="button"
              onClick={() => onSelect(task)}
              className="focus-visible:ring-ring/50 block w-full rounded text-left focus-visible:ring-3 focus-visible:outline-none"
            >
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {task.title}
                <Badge variant={STATUS_VARIANT[task.status]}>
                  {taskStatusLabel(task.status)}
                </Badge>
              </span>
              <span className="text-muted-foreground mt-2 block text-xs">
                {scheduleLabel(task)}
              </span>
              <span className="text-muted-foreground mt-1 block text-xs">
                {assigneeLabel(task)}
              </span>
              <div className="mt-3">
                <Progress value={task.progress} />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function BoardView({
  tasks,
  onSelect,
}: {
  tasks: readonly Task[];
  onSelect: (task: Task) => void;
}) {
  if (tasks.length === 0) return <EmptyState filtered />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {KANBAN_STATUSES.map((status) => {
        const cards = tasks.filter((task) => task.status === status);
        return (
          <section
            key={status}
            aria-label={`${taskStatusLabel(status)} tasks`}
            className="bg-muted/40 border-border min-w-0 rounded-xl border p-3"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">{taskStatusLabel(status)}</h2>
              <span className="text-muted-foreground text-xs">
                {cards.length}
              </span>
            </div>
            <div className="space-y-3">
              {cards.length === 0 ? (
                <p className="text-muted-foreground px-1 py-4 text-xs">
                  No tasks in this column.
                </p>
              ) : (
                cards.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onSelect={() => onSelect(task)}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CalendarView({
  tasks,
  onSelect,
}: {
  tasks: readonly Task[];
  onSelect: (task: Task) => void;
}) {
  const scheduled = tasks.filter((task) => task.startAt || task.dueAt);
  if (scheduled.length === 0) return <EmptyState filtered={tasks.length > 0} />;
  return (
    <section
      aria-label="Task calendar"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {scheduled.map((task) => (
        <article key={task.id} className="border-border rounded-xl border p-4">
          <p className="text-muted-foreground text-xs">
            {task.startAt
              ? `Starts ${dateLabel(task.startAt)}`
              : "No start date"}
          </p>
          <button
            type="button"
            onClick={() => onSelect(task)}
            className="focus-visible:ring-ring/50 mt-2 rounded text-left text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
          >
            {task.title}
          </button>
          <p className="text-muted-foreground mt-1 text-sm">
            Due {dateLabel(task.dueAt)}
          </p>
          <div className="mt-3">
            <Badge variant={STATUS_VARIANT[task.status]}>
              {taskStatusLabel(task.status)}
            </Badge>
          </div>
        </article>
      ))}
    </section>
  );
}

function TaskDetailDialog({
  preview,
  onClose,
}: {
  preview: TaskCollaborationPreview | null;
  onClose: () => void;
}) {
  const task = preview?.task;
  return (
    <Dialog
      open={task !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {task && preview ? (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <DialogTitle>{task.title}</DialogTitle>
                <Badge variant={STATUS_VARIANT[task.status]}>
                  {taskStatusLabel(task.status)}
                </Badge>
              </div>
              <DialogDescription>
                {task.description ??
                  "No description was provided for this task."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <section aria-labelledby="task-progress">
                <h2 id="task-progress" className="text-sm font-medium">
                  Progress
                </h2>
                <div className="mt-2">
                  <Progress value={task.progress} />
                </div>
              </section>
              <section aria-labelledby="task-schedule">
                <h2 id="task-schedule" className="text-sm font-medium">
                  Schedule
                </h2>
                <p className="text-muted-foreground mt-2 text-sm">
                  {scheduleLabel(task)}
                </p>
              </section>
            </div>
            <section
              aria-labelledby="task-assignees"
              className="border-border border-t pt-4"
            >
              <h2
                id="task-assignees"
                className="flex items-center gap-2 text-sm font-medium"
              >
                <Users aria-hidden="true" className="size-4" />
                Assignees
              </h2>
              {task.assignees.length ? (
                <ul
                  aria-label="Task assignees"
                  className="mt-2 space-y-1 text-sm"
                >
                  {task.assignees.map((assignee) => (
                    <li key={assignee.id}>{personName(assignee)}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-2 text-sm">
                  No one is assigned yet.
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                className="mt-3"
              >
                Manage assignees
              </Button>
              <p className="text-muted-foreground mt-2 text-xs">
                Assignment changes will be available when this UI is connected
                to the task API.
              </p>
            </section>
            <section
              aria-labelledby="task-files"
              className="border-border border-t pt-4"
            >
              <h2
                id="task-files"
                className="flex items-center gap-2 text-sm font-medium"
              >
                <Paperclip aria-hidden="true" className="size-4" />
                Attachments
              </h2>
              {preview.files.length ? (
                <ul className="mt-2 divide-y rounded-lg border">
                  {preview.files.map((file) => (
                    <li
                      key={file.id}
                      className="flex items-center justify-between gap-3 p-3 text-sm"
                    >
                      <span className="min-w-0 truncate">{file.filename}</span>
                      <Badge variant="outline">
                        {file.state.toLocaleLowerCase()}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-2 text-sm">
                  No files are attached yet.
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                className="mt-3"
              >
                <FileText aria-hidden="true" />
                Add attachment
              </Button>
              <p className="text-muted-foreground mt-2 text-xs">
                File actions will be available when this UI is connected to the
                task API.
              </p>
            </section>
            <section
              aria-labelledby="task-reviews"
              className="border-border border-t pt-4"
            >
              <h2
                id="task-reviews"
                className="flex items-center gap-2 text-sm font-medium"
              >
                <CheckCircle2 aria-hidden="true" className="size-4" />
                Reviews
              </h2>
              {preview.reviews.length ? (
                <ul className="mt-2 space-y-2">
                  {preview.reviews.map((review) => (
                    <li
                      key={review.id}
                      className="bg-muted/50 rounded-lg p-3 text-sm"
                    >
                      <Badge
                        variant={
                          review.outcome === "APPROVED"
                            ? "default"
                            : "destructive"
                        }
                      >
                        {review.outcome === "APPROVED"
                          ? "Approved"
                          : "Changes requested"}
                      </Badge>
                      <p className="mt-2">{review.note ?? "No review note."}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {review.reviewer
                          ? personName(review.reviewer)
                          : "Unknown reviewer"}{" "}
                        - {dateLabel(review.reviewedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-2 text-sm">
                  No review has been recorded.
                </p>
              )}
            </section>
            <section
              aria-labelledby="task-comments"
              className="border-border border-t pt-4"
            >
              <h2
                id="task-comments"
                className="flex items-center gap-2 text-sm font-medium"
              >
                <MessageSquare aria-hidden="true" className="size-4" />
                Comments
              </h2>
              {preview.comments.length ? (
                <ul className="mt-2 space-y-3">
                  {preview.comments.map((comment) => (
                    <li
                      key={comment.id}
                      className="bg-muted/50 rounded-lg p-3 text-sm"
                    >
                      <p>{comment.content}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {comment.author
                          ? personName(comment.author)
                          : "Unknown author"}{" "}
                        - {dateLabel(comment.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-2 text-sm">
                  No comments yet.
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                className="mt-3"
              >
                Add comment
              </Button>
              <p className="text-muted-foreground mt-2 text-xs">
                Comments can be added when this UI is connected to the task API.
              </p>
            </section>
            <section
              aria-labelledby="task-activity"
              className="border-border border-t pt-4"
            >
              <h2 id="task-activity" className="text-sm font-medium">
                Activity
              </h2>
              {preview.activity.length ? (
                <ul className="mt-2 space-y-2">
                  {preview.activity.map((entry) => (
                    <li key={entry.id} className="text-sm">
                      <span className="font-medium">
                        {entry.type.replaceAll("_", " ").toLocaleLowerCase()}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        by{" "}
                        {entry.actor
                          ? personName(entry.actor)
                          : "Unknown user"}{" "}
                        - {dateLabel(entry.occurredAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-2 text-sm">
                  No activity yet.
                </p>
              )}
            </section>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function TaskWorkspace({
  data,
  loading = false,
  error,
  onRetry,
}: {
  data: TaskWorkspaceData;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  const [view, setView] = useState<View>("list");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [selected, setSelected] = useState<Task | null>(null);
  const visibleTasks = useMemo(
    () => data.tasks.filter((task) => taskMatches(task, query.trim(), status)),
    [data.tasks, query, status],
  );
  const filtered = query.trim() !== "" || status !== null;
  const select = (task: Task) => setSelected(task);

  return (
    <section aria-labelledby="tasks-title" className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 id="tasks-title" className="text-xl font-semibold tracking-tight">
            Tasks
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Plan, assign, review, and track work across workspaces and
            departments.
          </p>
        </div>
        <div className="sm:text-right">
          <Button type="button" disabled>
            <Plus aria-hidden="true" />
            New task
          </Button>
          <p className="text-muted-foreground mt-1 text-xs">
            Task creation will be available when this UI is connected to the
            task API.
          </p>
        </div>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Tasks could not be loaded</AlertTitle>
          <AlertDescription className="mt-2">
            {error}
            {onRetry ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-2"
                onClick={onRetry}
              >
                Try again
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {loading ? (
        <p role="status" className="text-muted-foreground">
          Loading tasks...
        </p>
      ) : error ? null : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="task-search">Search tasks</Label>
                <Input
                  id="task-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search title or assignee"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="task-status">Status</Label>
                <Select
                  value={status ?? ALL}
                  onValueChange={(value) =>
                    setStatus(value === ALL ? null : (value as TaskStatus))
                  }
                >
                  <SelectTrigger id="task-status" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All statuses</SelectItem>
                    {TASK_STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {taskStatusLabel(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div
              role="group"
              aria-label="Task view"
              className="flex rounded-lg border p-1"
            >
              {(
                [
                  { id: "list", label: "List", icon: List },
                  { id: "board", label: "Board", icon: LayoutGrid },
                  { id: "calendar", label: "Calendar", icon: CalendarDays },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <Button
                  key={id}
                  type="button"
                  aria-pressed={view === id}
                  variant={view === id ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setView(id)}
                >
                  <Icon aria-hidden="true" />
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-muted-foreground text-sm">
            {visibleTasks.length} task{visibleTasks.length === 1 ? "" : "s"}
            {filtered ? " matching filters" : ""}
          </p>
          {view === "list" ? (
            <ListView
              tasks={visibleTasks}
              onSelect={select}
              filtered={filtered}
            />
          ) : null}
          {view === "board" ? (
            <BoardView tasks={visibleTasks} onSelect={select} />
          ) : null}
          {view === "calendar" ? (
            <CalendarView tasks={visibleTasks} onSelect={select} />
          ) : null}
        </>
      )}
      <TaskDetailDialog
        preview={
          selected
            ? (data.details[selected.id] ?? {
                task: selected,
                comments: [],
                activity: [],
                reviews: [],
                files: [],
              })
            : null
        }
        onClose={() => setSelected(null)}
      />
    </section>
  );
}
