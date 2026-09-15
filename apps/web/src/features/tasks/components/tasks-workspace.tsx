"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  LayoutGrid,
  List,
  MessageSquare,
  Paperclip,
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
  canUpdateProgress: boolean;
  canTransition: boolean;
  canSubmit: boolean;
  canReview: boolean;
  canUpload: boolean;
  canAssign: boolean;
  assignmentDirectoryMessage?: string;
  addComment: (id: string, content: string) => Promise<unknown>;
  updateProgress: (id: string, progress: number) => Promise<unknown>;
  transition: (id: string, status: TaskStatus) => Promise<unknown>;
  submit: (id: string) => Promise<unknown>;
  review: (
    id: string,
    outcome: "APPROVED" | "CHANGES_REQUESTED",
    note: string,
  ) => Promise<unknown>;
  upload: (id: string, file: File) => Promise<unknown>;
  addAssignee: (id: string, userId: string) => Promise<unknown>;
  removeAssignee: (id: string, userId: string) => Promise<unknown>;
}

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
  collaboration,
}: {
  preview: TaskCollaborationPreview | null;
  onClose: () => void;
  collaboration?: TaskCollaborationActions;
}) {
  const [comment, setComment] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
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
            <div className="grid gap-4 sm:grid-cols-2">
              <section aria-labelledby="task-progress">
                <h2 id="task-progress" className="text-sm font-medium">
                  Progress
                </h2>
                <div className="mt-2">
                  <Progress value={task.progress} />
                </div>
                {collaboration?.canUpdateProgress ? (
                  <div className="mt-3 flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <Label htmlFor="task-progress-value">
                        Update progress
                      </Label>
                      <Input
                        id="task-progress-value"
                        className="mt-1"
                        type="number"
                        min="0"
                        max="100"
                        value={progress ?? String(task.progress)}
                        onChange={(event) => setProgress(event.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={detail.isFetching}
                      onClick={() => {
                        const value = Number(progress ?? String(task.progress));
                        if (
                          !Number.isInteger(value) ||
                          value < 0 ||
                          value > 100
                        ) {
                          setActionError(
                            "Progress must be a whole number from 0 to 100.",
                          );
                          return;
                        }
                        void perform(() =>
                          collaboration.updateProgress(task.id, value),
                        );
                      }}
                    >
                      Save
                    </Button>
                  </div>
                ) : null}
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
            {collaboration?.canTransition ? (
              <section
                className="border-border border-t pt-4"
                aria-labelledby="task-status-change"
              >
                <h2 id="task-status-change" className="text-sm font-medium">
                  Status
                </h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ASSIGNEE_TRANSITION_TARGETS[task.status].map((status) => (
                    <Button
                      key={status}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={detail.isFetching}
                      onClick={() =>
                        void perform(() =>
                          collaboration.transition(task.id, status),
                        )
                      }
                    >
                      Move to {taskStatusLabel(status)}
                    </Button>
                  ))}
                </div>
              </section>
            ) : null}
            {collaboration?.canSubmit && task.status === "IN_PROGRESS" ? (
              <section className="border-border border-t pt-4">
                <Button
                  type="button"
                  disabled={detail.isFetching}
                  onClick={() =>
                    void perform(() => collaboration.submit(task.id))
                  }
                >
                  Submit for review
                </Button>
              </section>
            ) : null}
            {collaboration?.canReview && task.status === "UNDER_REVIEW" ? (
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
                      {collaboration?.canAssign ? (
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
              {collaboration?.canAssign ? (
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
                  {resolvedPreview.files.map((file) => (
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
  onFiltersChange?: (filters: {
    search: string;
    status: TaskStatus | null;
  }) => void;
  onPageChange?: (page: number) => void;
  collaboration?: TaskCollaborationActions;
}) {
  const [view, setView] = useState<View>("list");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [selected, setSelected] = useState<Task | null>(null);
  const visibleTasks = useMemo(
    () =>
      (tasks ?? data?.tasks ?? []).filter((task) =>
        taskMatches(task, query.trim(), status),
      ),
    [tasks, data?.tasks, query, status],
  );
  const filtered = query.trim() !== "" || status !== null;
  const select = (task: Task) => setSelected(task);

  useEffect(() => {
    onFiltersChange?.({ search: query, status });
  }, [onFiltersChange, query, status]);

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
  );
}
