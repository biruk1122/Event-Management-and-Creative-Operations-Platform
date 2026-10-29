"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Ban,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
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
  DialogContent as BaseDialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkDialogContent as DialogContent } from "@/components/ui/work-dialog-content";
import { WorkSurface } from "@/components/ui/work-surface";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { ChecklistSection } from "./checklist-section";
import {
  taskProgressSummary,
  taskProgressTone,
} from "../lib/task-progress-tone";
import {
  KANBAN_STATUSES,
  TASK_STATUSES,
  dateLabel,
  personName,
  scheduleLabel,
  taskPriorityLabel,
  taskStatusLabel,
  taskTypeLabel,
  type Task,
  type TaskCollaborationPreview,
  type TaskPerson,
  type TaskPriority,
  type TaskStatus,
  type TaskWorkspaceData,
} from "../lib/tasks-types";
import { CreateTaskDialog, type CreateTaskValues } from "./create-task-dialog";

type View = "list" | "board" | "calendar";

const ALL = "ALL";
const ASSIGNEE_TRANSITION_TARGETS: Record<TaskStatus, readonly TaskStatus[]> = {
  TODO: ["IN_PROGRESS", "BLOCKED", "CANCELLED"],
  IN_PROGRESS: ["BLOCKED", "CANCELLED"],
  UNDER_REVIEW: [],
  BLOCKED: ["TODO", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export interface TaskCollaborationActions {
  detailKey: (id: string) => readonly unknown[];
  loadPreview: (
    id: string,
    signal?: AbortSignal,
  ) => Promise<TaskCollaborationPreview>;
  users: readonly {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }[];
  canComment: boolean;
  /** Per-task: whether the viewer may add or remove *new* checklist items
   * on *this* task - only this task's own creator (or an organization
   * -scoped actor) may, same creator-gating as `canManageAssignees`. An
   * item's own ownership (below) narrows further: even a creator-gated
   * editor may not move/remove an item someone else added. */
  canEditChecklist: (task: Task) => boolean;
  /** The current viewer's own id, so the checklist can tell "I added this
   * one" from "someone else added this one" - only an item's own creator
   * may remove it, not merely anyone who holds `task.update`. */
  currentUserId: string;
  /** True for an organization-scoped actor (Super Admin) - the fallback
   * for a legacy checklist item with no recorded creator. */
  canManageUnattributedChecklistItems: boolean;
  /** These four are per-task, not a blanket role capability: the
   * underlying grant is SELF-scoped to "I am this task's assignee," so a
   * creator/manager who is not also the assignee must not see these
   * controls as usable on a task they merely created. */
  canToggleChecklist: (task: Task) => boolean;
  canTransition: (task: Task) => boolean;
  canSubmit: (task: Task) => boolean;
  /** Per-task: only this task's own creator (or an organization-scoped
   * actor) may record a review decision - prevents a Manager who is
   * merely this task's assignee from approving/rejecting their own
   * assigned work just because they hold `task.review` broadly. */
  canReview: (task: Task) => boolean;
  canUpload: boolean;
  /** Blanket: gates the "Add subtask" action and the subtask-creation
   * dialog's own assignee picker, since a Manager manages assignment by
   * creating subtasks regardless of who created the parent task. */
  canAssign: boolean;
  /** Per-task: whether the viewer may add/remove assignees on *this*
   * specific task. An organization-scoped actor always can; a
   * department-scoped actor only when they are this task's own creator -
   * a Manager who is merely its assignee manages assignment only through
   * subtasks (`canAssign` above), not by editing who else works on a task
   * someone else assigned to them. */
  canManageAssignees: (task: Task) => boolean;
  assignmentDirectoryMessage?: string;
  addComment: (id: string, content: string) => Promise<unknown>;
  addChecklistItem: (id: string, description: string) => Promise<unknown>;
  removeChecklistItem: (id: string, itemId: string) => Promise<unknown>;
  reorderChecklistItems: (
    id: string,
    orderedItemIds: string[],
  ) => Promise<unknown>;
  toggleChecklistItem: (
    id: string,
    itemId: string,
    completed: boolean,
  ) => Promise<unknown>;
  transition: (id: string, status: TaskStatus) => Promise<unknown>;
  submit: (id: string) => Promise<unknown>;
  review: (
    id: string,
    outcome: "APPROVED" | "CHANGES_REQUESTED",
    note: string,
  ) => Promise<unknown>;
  upload: (id: string, file: File) => Promise<unknown>;
  /** A short-lived signed URL for one attachment - never served from this
   * app's own origin. */
  download: (id: string, fileId: string) => Promise<{ url: string }>;
  addAssignee: (id: string, userId: string) => Promise<unknown>;
  removeAssignee: (id: string, userId: string) => Promise<unknown>;
  /** Manager -> Team Member delegation (a top-level task's own subtasks). */
  listSubtasks: (parentTaskId: string, signal?: AbortSignal) => Promise<Task[]>;
  createSubtask: (
    parentTaskId: string,
    values: CreateTaskValues,
  ) => Promise<Task>;
  loadEligibleAssignees: (
    departmentId: string,
    signal?: AbortSignal,
  ) => Promise<TaskPerson[]>;
}

interface TaskActionTarget {
  key: string;
  label: string;
  run: () => Promise<unknown>;
}

/** The compact "Actions" menu's contents: every lifecycle transition and
 * the submit action this specific viewer may use on this specific task -
 * review decisions stay their own section below, since they need a note
 * field rather than a one-click menu item. */
function taskActionTargetsFor(
  task: Task,
  collaboration: TaskCollaborationActions | undefined,
): TaskActionTarget[] {
  if (!collaboration) return [];
  const targets: TaskActionTarget[] = [];
  if (collaboration.canTransition(task)) {
    for (const status of ASSIGNEE_TRANSITION_TARGETS[task.status]) {
      targets.push({
        key: `transition-${status}`,
        label: `Move to ${taskStatusLabel(status)}`,
        run: () => collaboration.transition(task.id, status),
      });
    }
  }
  if (collaboration.canSubmit(task) && task.status === "IN_PROGRESS") {
    targets.push({
      key: "submit",
      label: "Submit for review",
      run: () => collaboration.submit(task.id),
    });
  }
  return targets;
}

// To do: neutral. In progress: active work. Under review: pending review.
// Blocked: needs attention. Completed: success. Cancelled: muted, not an
// error - distinct from Blocked, which does need attention.
const STATUS_VARIANT: Record<
  TaskStatus,
  "secondary" | "default" | "information" | "warning" | "success" | "outline"
> = {
  TODO: "secondary",
  IN_PROGRESS: "default",
  UNDER_REVIEW: "information",
  BLOCKED: "warning",
  COMPLETED: "success",
  CANCELLED: "outline",
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

function TaskProgressBar({ task }: { task: Task }) {
  return (
    <ProgressBar
      percent={task.progress}
      summary={taskProgressSummary(task.progress)}
      tone={taskProgressTone(task)}
      label="Task progress"
    />
  );
}

function TaskCard({ task, onSelect }: { task: Task; onSelect: () => void }) {
  return (
    <article
      data-task-card
      className="border-border bg-card space-y-3 rounded-xl border p-4 shadow-xs"
    >
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
      <TaskProgressBar task={task} />
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

/** True when this task can move directly to CANCELLED from its current
 * status, mirroring the same targets `taskActionTargetsFor` already offers
 * inside the detail dialog - the list row's Cancel action is a shortcut to
 * the identical transition, not a separate capability. */
function canCancelFromList(
  task: Task,
  collaboration: TaskCollaborationActions | undefined,
): boolean {
  return Boolean(
    collaboration?.canTransition(task) &&
      ASSIGNEE_TRANSITION_TARGETS[task.status].includes("CANCELLED"),
  );
}

function ListView({
  tasks,
  onSelect,
  filtered,
  page,
  pageSize,
  collaboration,
}: {
  tasks: readonly Task[];
  onSelect: (task: Task) => void;
  filtered: boolean;
  page: number;
  pageSize: number;
  collaboration?: TaskCollaborationActions;
}) {
  const [cancelTarget, setCancelTarget] = useState<Task | null>(null);
  return (
    <>
      <div className="border-border hidden overflow-x-auto rounded-xl border sm:block">
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground border-border border-b text-xs">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                No
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Task Description
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Assigned People
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Due Date
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Type
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Stage
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                File
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {tasks.map((task, index) => (
              <tr key={task.id} className="hover:bg-muted/50">
                <td className="text-muted-foreground px-4 py-3">
                  {(page - 1) * pageSize + index + 1}
                </td>
                <th scope="row" className="max-w-xs px-4 py-3 font-normal">
                  <button
                    type="button"
                    onClick={() => onSelect(task)}
                    className="focus-visible:ring-ring/50 rounded text-left font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                  >
                    {task.title}
                  </button>
                  {task.description ? (
                    <p
                      className="text-muted-foreground mt-0.5 truncate text-xs"
                      title={task.description}
                    >
                      {task.description}
                    </p>
                  ) : null}
                </th>
                <td className="text-muted-foreground px-4 py-3">
                  {assigneeLabel(task)}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {dateLabel(task.dueAt)}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {taskTypeLabel(task.type)}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[task.status]}>
                    {taskStatusLabel(task.status)}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Open attachments for ${task.title}`}
                    onClick={() => onSelect(task)}
                  >
                    <Paperclip aria-hidden="true" className="size-3.5" />
                  </Button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Open ${task.title}`}
                      onClick={() => onSelect(task)}
                    >
                      <Eye aria-hidden="true" className="size-3.5" />
                    </Button>
                    {canCancelFromList(task, collaboration) ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Cancel ${task.title}`}
                        onClick={() => setCancelTarget(task)}
                      >
                        <Ban aria-hidden="true" className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
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
                {assigneeLabel(task)} · {taskTypeLabel(task.type)}
              </span>
              <div className="mt-3">
                <TaskProgressBar task={task} />
              </div>
            </button>
          </li>
        ))}
      </ul>
      {tasks.length === 0 ? <EmptyState filtered={filtered} /> : null}
      <CancelTaskDialog
        task={cancelTarget}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        onCancel={(id) => collaboration!.transition(id, "CANCELLED")}
        onCancelled={() => setCancelTarget(null)}
      />
    </>
  );
}

function CancelTaskDialog({
  task,
  onOpenChange,
  onCancel,
  onCancelled,
}: {
  task: Task | null;
  onOpenChange: (open: boolean) => void;
  onCancel: (id: string) => Promise<unknown>;
  onCancelled: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    if (!task) return;
    setBusy(true);
    setError(null);
    try {
      await onCancel(task.id);
      onCancelled();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We could not cancel that task. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={task !== null} onOpenChange={onOpenChange}>
      <BaseDialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel task?</DialogTitle>
          <DialogDescription>
            {task
              ? `Move "${task.title}" to Cancelled? Its history stays on the task, and this can be undone from the task's own status controls.`
              : null}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Keep task
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void confirm()}
          >
            {busy ? "Cancelling…" : "Cancel task"}
          </Button>
        </DialogFooter>
      </BaseDialogContent>
    </Dialog>
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
            data-task-column
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
      className="flex flex-wrap justify-center gap-3"
    >
      {scheduled.map((task) => (
        <article
          data-task-card
          key={task.id}
          className="border-border w-full shrink grow-0 basis-72 rounded-xl border p-4 @min-[48rem]:basis-80"
        >
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
  collaboration,
  onSelectTask,
}: {
  preview: TaskCollaborationPreview | null;
  onClose: () => void;
  collaboration?: TaskCollaborationActions;
  /** Re-targets this same dialog at a different task (used to open a
   * subtask from the parent's own detail view). */
  onSelectTask?: (task: Task) => void;
}) {
  const [comment, setComment] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [subtaskCreateOpen, setSubtaskCreateOpen] = useState(false);
  const selectedTask = preview?.task;
  const detail = useQuery({
    queryKey: collaboration?.detailKey(selectedTask?.id ?? "") ?? [
      "task-preview",
    ],
    queryFn: ({ signal }) =>
      collaboration!.loadPreview(selectedTask!.id, signal),
    enabled: Boolean(collaboration && selectedTask),
    retry: false,
  });
  const resolvedPreview = collaboration ? (detail.data ?? null) : preview;
  const task = resolvedPreview?.task ?? selectedTask;
  const taskActionTargets = task
    ? taskActionTargetsFor(task, collaboration)
    : [];
  // Subtasks are a top-level task's own breakdown only - a subtask does not
  // get a further level of subtasks (matches the 2-level delegation this
  // hierarchy was designed for: Manager -> Team Member).
  const isTopLevelTask = Boolean(task && task.parentTaskId === null);
  const subtasks = useQuery({
    queryKey: [...(collaboration?.detailKey(task?.id ?? "") ?? []), "subtasks"],
    queryFn: ({ signal }) => collaboration!.listSubtasks(task!.id, signal),
    enabled: Boolean(collaboration && task && isTopLevelTask),
    retry: false,
  });

  async function perform(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      await detail.refetch();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "We could not save that change. Your input is still here; try again.",
      );
    }
  }

  async function handleDownload(fileId: string) {
    if (!collaboration || !task) return;
    setActionError(null);
    setDownloadingFileId(fileId);
    try {
      const grant = await collaboration.download(task.id, fileId);
      window.location.assign(grant.url);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The file could not be downloaded. Try again.",
      );
    } finally {
      setDownloadingFileId(null);
    }
  }

  return (
    <Dialog
      open={task !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {task ? (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle>{task.title}</DialogTitle>
                  <Badge variant={STATUS_VARIANT[task.status]}>
                    {taskStatusLabel(task.status)}
                  </Badge>
                  {task.status === "UNDER_REVIEW" ? (
                    <Badge variant="information">Awaiting review</Badge>
                  ) : null}
                </div>
                {taskActionTargets.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={detail.isFetching}
                      >
                        Actions
                        <ChevronDown
                          aria-hidden="true"
                          data-icon="inline-end"
                        />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {taskActionTargets.map((action) => (
                        <DropdownMenuItem
                          key={action.key}
                          onSelect={() => void perform(action.run)}
                        >
                          {action.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
              <DialogDescription>
                {task.description ??
                  "No description was provided for this task."}
              </DialogDescription>
            </DialogHeader>
            {collaboration && detail.isPending ? (
              <p role="status" className="text-muted-foreground text-sm">
                Loading task collaboration…
              </p>
            ) : null}
            {collaboration && detail.isError ? (
              <Alert variant="destructive">
                <AlertTitle>Task details could not be loaded</AlertTitle>
                <AlertDescription className="mt-2">
                  {detail.error.message}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-2"
                    onClick={() => void detail.refetch()}
                  >
                    Try again
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {actionError ? (
              <Alert variant="destructive">
                <AlertTitle>Task change could not be saved</AlertTitle>
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-4">
              <ChecklistSection
                task={task}
                items={task.checklistItems}
                busy={detail.isFetching}
                actions={{
                  canEditItems: Boolean(collaboration?.canEditChecklist(task)),
                  canToggleItems: Boolean(
                    collaboration?.canToggleChecklist(task),
                  ),
                  currentUserId: collaboration?.currentUserId ?? "",
                  canManageUnattributedItems: Boolean(
                    collaboration?.canManageUnattributedChecklistItems,
                  ),
                  addItem: (description) =>
                    perform(() =>
                      collaboration!.addChecklistItem(task.id, description),
                    ),
                  removeItem: (itemId) =>
                    perform(() =>
                      collaboration!.removeChecklistItem(task.id, itemId),
                    ),
                  reorderItems: (orderedItemIds) =>
                    perform(() =>
                      collaboration!.reorderChecklistItems(
                        task.id,
                        orderedItemIds,
                      ),
                    ),
                  toggleItem: (itemId, completed) =>
                    perform(() =>
                      collaboration!.toggleChecklistItem(
                        task.id,
                        itemId,
                        completed,
                      ),
                    ),
                }}
              />
              <section
                aria-labelledby="task-schedule"
                className="border-border border-t pt-4"
              >
                <h2 id="task-schedule" className="text-sm font-medium">
                  Schedule
                </h2>
                <p className="text-muted-foreground mt-2 text-sm">
                  {scheduleLabel(task)}
                </p>
              </section>
            </div>
            {collaboration?.canReview(task) && task.status === "UNDER_REVIEW" ? (
              <section
                className="border-border space-y-2 border-t pt-4"
                aria-labelledby="task-review-decision"
              >
                <Label id="task-review-decision" htmlFor="task-review-note">
                  Review note (optional)
                </Label>
                <textarea
                  id="task-review-note"
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  className="border-input bg-background min-h-20 w-full rounded-md border px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    disabled={detail.isFetching}
                    onClick={() =>
                      void perform(() =>
                        collaboration.review(task.id, "APPROVED", reviewNote),
                      )
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={detail.isFetching}
                    onClick={() =>
                      void perform(() =>
                        collaboration.review(
                          task.id,
                          "CHANGES_REQUESTED",
                          reviewNote,
                        ),
                      )
                    }
                  >
                    Request changes
                  </Button>
                </div>
              </section>
            ) : null}
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
                    <li
                      key={assignee.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span>{personName(assignee)}</span>
                      {collaboration?.canManageAssignees(task) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={detail.isFetching}
                          onClick={() =>
                            void perform(() =>
                              collaboration.removeAssignee(
                                task.id,
                                assignee.id,
                              ),
                            )
                          }
                        >
                          Remove
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-2 text-sm">
                  No one is assigned yet.
                </p>
              )}
              {collaboration?.canManageAssignees(task) ? (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div className="min-w-48 flex-1">
                    <Label htmlFor="task-assignee">Add assignee</Label>
                    <Select value={assigneeId} onValueChange={setAssigneeId}>
                      <SelectTrigger id="task-assignee" className="mt-1">
                        <SelectValue placeholder="Select a user" />
                      </SelectTrigger>
                      <SelectContent>
                        {collaboration.users
                          .filter(
                            (user) =>
                              !task.assignees.some(
                                (assignee) => assignee.id === user.id,
                              ),
                          )
                          .map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {personName(user)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!assigneeId || detail.isFetching}
                    onClick={() =>
                      void perform(() =>
                        collaboration.addAssignee(task.id, assigneeId),
                      )
                    }
                  >
                    Add
                  </Button>
                  {collaboration.assignmentDirectoryMessage ? (
                    <p
                      role="status"
                      className="text-muted-foreground basis-full text-xs"
                    >
                      {collaboration.assignmentDirectoryMessage}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
            {collaboration && isTopLevelTask ? (
              <section
                aria-labelledby="task-subtasks"
                className="border-border border-t pt-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2
                    id="task-subtasks"
                    className="flex items-center gap-2 text-sm font-medium"
                  >
                    <CheckCircle2 aria-hidden="true" className="size-4" />
                    Subtasks
                  </h2>
                  {collaboration.canAssign ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSubtaskCreateOpen(true)}
                    >
                      <Plus aria-hidden="true" data-icon="inline-start" />
                      Add subtask
                    </Button>
                  ) : null}
                </div>
                {task.subtaskSummary ? (
                  <p className="text-muted-foreground mt-2 text-sm">
                    {task.subtaskSummary.completed} of{" "}
                    {task.subtaskSummary.total} complete
                    {task.subtaskSummary.overdue > 0
                      ? ` · ${task.subtaskSummary.overdue} overdue`
                      : ""}
                  </p>
                ) : null}
                {subtasks.isPending ? (
                  <p
                    role="status"
                    className="text-muted-foreground mt-2 text-sm"
                  >
                    Loading subtasks…
                  </p>
                ) : subtasks.isError ? (
                  <p className="text-destructive mt-2 text-sm">
                    Subtasks could not be loaded.
                  </p>
                ) : (subtasks.data ?? []).length > 0 ? (
                  <ul aria-label="Subtasks" className="mt-2 space-y-1 text-sm">
                    {(subtasks.data ?? []).map((subtask) => (
                      <li
                        key={subtask.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <button
                          type="button"
                          className="focus-visible:ring-ring/50 rounded text-left underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                          onClick={() => onSelectTask?.(subtask)}
                        >
                          {subtask.title}
                        </button>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-muted-foreground text-xs">
                            {subtask.progress === null
                              ? "Not tracked"
                              : `${subtask.progress}%`}
                          </span>
                          <Badge variant={STATUS_VARIANT[subtask.status]}>
                            {taskStatusLabel(subtask.status)}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground mt-2 text-sm">
                    No subtasks yet.
                  </p>
                )}
                {collaboration.canAssign ? (
                  <CreateTaskDialog
                    open={subtaskCreateOpen}
                    onOpenChange={setSubtaskCreateOpen}
                    departments={
                      task.departmentId
                        ? [
                            {
                              id: task.departmentId,
                              name: "This task's department",
                            },
                          ]
                        : []
                    }
                    departmentLocked
                    parentTaskId={task.id}
                    loadEligibleAssignees={collaboration.loadEligibleAssignees}
                    onCreate={(values) =>
                      collaboration.createSubtask(task.id, values)
                    }
                    onUploadAttachment={collaboration.upload}
                    onCreated={() => {
                      void subtasks.refetch();
                      void detail.refetch();
                    }}
                  />
                ) : null}
              </section>
            ) : null}
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
              {resolvedPreview?.files.length ? (
                <ul className="mt-2 divide-y rounded-lg border">
                  {resolvedPreview.files.map((attachedFile) => (
                    <li
                      key={attachedFile.id}
                      className="flex items-center justify-between gap-3 p-3 text-sm"
                    >
                      <span data-file-name className="min-w-0 truncate">
                        {attachedFile.filename}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline">
                          {attachedFile.state.toLocaleLowerCase()}
                        </Badge>
                        {attachedFile.state === "available" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Download ${attachedFile.filename}`}
                            disabled={downloadingFileId === attachedFile.id}
                            onClick={() => void handleDownload(attachedFile.id)}
                          >
                            <Download aria-hidden="true" />
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-2 text-sm">
                  No files are attached yet.
                </p>
              )}
              <p className="text-muted-foreground mt-2 text-xs">
                Attachments are stored through the task API.
              </p>
              {collaboration?.canUpload ? (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div>
                    <Label htmlFor="task-file">Add attachment</Label>
                    <Input
                      id="task-file"
                      className="mt-1"
                      type="file"
                      onChange={(event) =>
                        setFile(event.target.files?.[0] ?? null)
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!file || detail.isFetching}
                    onClick={() =>
                      void perform(async () => {
                        await collaboration.upload(task.id, file!);
                        setFile(null);
                      })
                    }
                  >
                    Upload
                  </Button>
                </div>
              ) : null}
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
              {resolvedPreview?.reviews.length ? (
                <ul className="mt-2 space-y-2">
                  {resolvedPreview.reviews.map((review) => (
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
              {resolvedPreview?.comments.length ? (
                <ul className="mt-2 space-y-3">
                  {resolvedPreview.comments.map((comment) => (
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
              {collaboration?.canComment ? (
                <div className="mt-3 space-y-2">
                  <Label htmlFor="task-comment">Add comment</Label>
                  <textarea
                    id="task-comment"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    className="border-input bg-background min-h-20 w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="Write a task update"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={comment.trim() === "" || detail.isFetching}
                    onClick={() =>
                      void perform(async () => {
                        await collaboration.addComment(task.id, comment);
                        setComment("");
                      })
                    }
                  >
                    Add comment
                  </Button>
                </div>
              ) : null}
            </section>
            <section
              aria-labelledby="task-activity"
              className="border-border border-t pt-4"
            >
              <h2 id="task-activity" className="text-sm font-medium">
                Activity
              </h2>
              {resolvedPreview?.activity.length ? (
                <ul className="mt-2 space-y-2">
                  {resolvedPreview.activity.map((entry) => (
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

export interface TaskWorkspaceFilters {
  search: string;
  status: TaskStatus | null;
  assignedToMe: boolean;
  createdByMe: boolean;
  overdueOnly: boolean;
  departmentId: string | null;
}

export function TaskWorkspace({
  data,
  tasks,
  total,
  page,
  pageSize,
  loading = false,
  fetching = false,
  error,
  onRetry,
  onFiltersChange,
  onPageChange,
  collaboration,
  canCreate = false,
  onOpenCreate,
  canFilterByReview = false,
  departments = [],
}: {
  /** Static data remains available only for isolated component tests. */
  data?: TaskWorkspaceData;
  /** Production data is provided by the API-backed task manager. */
  tasks?: readonly Task[];
  total?: number;
  page?: number;
  pageSize?: number;
  loading?: boolean;
  fetching?: boolean;
  error?: string;
  onRetry?: () => void;
  onFiltersChange?: (filters: TaskWorkspaceFilters) => void;
  onPageChange?: (page: number) => void;
  collaboration?: TaskCollaborationActions;
  canCreate?: boolean;
  onOpenCreate?: () => void;
  /** Shows the "Awaiting Review" quick filter - only meaningful for a
   * caller who holds `task.review` somewhere. */
  canFilterByReview?: boolean;
  /** Powers the "Department Tasks" filter; empty hides that control. */
  departments?: readonly { id: string; name: string }[];
}) {
  const [view, setView] = useState<View>("list");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [createdByMe, setCreatedByMe] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Task | null>(null);
  const visibleTasks = useMemo(
    () =>
      (tasks ?? data?.tasks ?? []).filter((task) =>
        taskMatches(task, query.trim(), status),
      ),
    [tasks, data?.tasks, query, status],
  );
  const filtered =
    query.trim() !== "" ||
    status !== null ||
    assignedToMe ||
    createdByMe ||
    overdueOnly ||
    departmentId !== null;
  const select = (task: Task) => setSelected(task);

  useEffect(() => {
    onFiltersChange?.({
      search: query,
      status,
      assignedToMe,
      createdByMe,
      overdueOnly,
      departmentId,
    });
  }, [
    onFiltersChange,
    query,
    status,
    assignedToMe,
    createdByMe,
    overdueOnly,
    departmentId,
  ]);

  return (
    <WorkSurface>
      <section aria-labelledby="tasks-title" className="space-y-5">
        <div
          data-work-heading
          className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <h1
              id="tasks-title"
              className="text-xl font-semibold tracking-tight"
            >
              Tasks
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Plan, assign, review, and track work across workspaces and
              departments.
            </p>
          </div>
          {canCreate ? (
            <Button type="button" onClick={onOpenCreate}>
              <Plus aria-hidden="true" data-icon="inline-start" />
              New task
            </Button>
          ) : null}
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
            <div
              data-work-filters
              className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
            >
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
                aria-label="Quick task filters"
                className="flex flex-wrap items-center gap-2"
              >
                <Button
                  type="button"
                  variant={assignedToMe ? "secondary" : "outline"}
                  size="sm"
                  aria-pressed={assignedToMe}
                  onClick={() => setAssignedToMe((current) => !current)}
                >
                  My Tasks
                </Button>
                <Button
                  type="button"
                  variant={createdByMe ? "secondary" : "outline"}
                  size="sm"
                  aria-pressed={createdByMe}
                  onClick={() => setCreatedByMe((current) => !current)}
                >
                  Created by Me
                </Button>
                {canFilterByReview ? (
                  <Button
                    type="button"
                    variant={
                      status === "UNDER_REVIEW" ? "secondary" : "outline"
                    }
                    size="sm"
                    aria-pressed={status === "UNDER_REVIEW"}
                    onClick={() =>
                      setStatus((current) =>
                        current === "UNDER_REVIEW" ? null : "UNDER_REVIEW",
                      )
                    }
                  >
                    Awaiting Review
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant={overdueOnly ? "secondary" : "outline"}
                  size="sm"
                  aria-pressed={overdueOnly}
                  onClick={() => setOverdueOnly((current) => !current)}
                >
                  Overdue
                </Button>
                {departments.length > 0 ? (
                  <Select
                    value={departmentId ?? ALL}
                    onValueChange={(value) =>
                      setDepartmentId(value === ALL ? null : value)
                    }
                  >
                    <SelectTrigger
                      aria-label="Department Tasks"
                      className="h-9 w-44"
                    >
                      <SelectValue placeholder="Department Tasks" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All departments</SelectItem>
                      {departments.map((department) => (
                        <SelectItem key={department.id} value={department.id}>
                          {department.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
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
              {total ?? visibleTasks.length} task
              {(total ?? visibleTasks.length) === 1 ? "" : "s"}
              {filtered ? " matching filters" : ""}
              {fetching ? " · Updating…" : ""}
            </p>
            {view === "list" ? (
              <ListView
                tasks={visibleTasks}
                onSelect={select}
                filtered={filtered}
                page={page ?? 1}
                pageSize={pageSize ?? 25}
                {...(collaboration ? { collaboration } : {})}
              />
            ) : null}
            {view === "board" ? (
              <BoardView tasks={visibleTasks} onSelect={select} />
            ) : null}
            {view === "calendar" ? (
              <CalendarView tasks={visibleTasks} onSelect={select} />
            ) : null}
            {onPageChange &&
            page &&
            pageSize &&
            total !== undefined &&
            total > pageSize ? (
              <nav
                aria-label="Task pagination"
                className="flex items-center justify-between gap-3"
              >
                <p className="text-muted-foreground text-sm">
                  Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || fetching}
                    onClick={() => onPageChange(page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= Math.ceil(total / pageSize) || fetching}
                    onClick={() => onPageChange(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </nav>
            ) : null}
          </>
        )}
        {collaboration ? (
          <TaskDetailDialog
            key={selected?.id}
            preview={
              selected
                ? {
                    task: selected,
                    comments: [],
                    activity: [],
                    reviews: [],
                    files: [],
                  }
                : null
            }
            onClose={() => setSelected(null)}
            collaboration={collaboration}
            onSelectTask={select}
          />
        ) : (
          <TaskDetailDialog
            key={selected?.id}
            preview={
              selected
                ? (data?.details[selected.id] ?? {
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
        )}
      </section>
    </WorkSurface>
  );
}
