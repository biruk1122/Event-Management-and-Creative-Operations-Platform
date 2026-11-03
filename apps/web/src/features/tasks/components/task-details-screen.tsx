"use client";

import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentAccess } from "@/features/auth/api/access-queries";
import type { CurrentAccess } from "@/features/auth/api/access-queries";

import * as gateway from "../api/tasks-gateway";
import { AttachmentDropzone } from "@/components/ui/attachment-dropzone";
import { listCampaigns } from "@/features/campaigns/api/campaigns-gateway";
import { listEvents } from "@/features/events/api/events-gateway";
import { taskKeys, useTaskMutations } from "../api/tasks-queries";
import {
  canActOnAssignedTask,
  canManageAssigneesFor,
  creatorGatedFor,
  hasGrant,
  isAssignee,
} from "../lib/task-access";
import { attachmentProblem } from "../lib/task-attachments";
import { ASSIGNEE_TRANSITION_TARGETS } from "../lib/task-transitions";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
  TASK_TYPES,
  dateLabel,
  personName,
  scheduleLabel,
  type ManagedFile,
  type Task,
  type TaskActivity,
  type TaskComment,
  type TaskPriority,
  type TaskType,
} from "../lib/tasks-types";

import { ChecklistSection } from "./checklist-section";

const PRIORITIES = Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[];
const NO_RELATED = "__none__";

export function TaskDetailsScreen({ taskId }: { taskId: string }) {
  const access = useCurrentAccess();

  if (access.isPending) {
    return <p role="status">Checking permissions...</p>;
  }
  if (access.isError) {
    return (
      <p role="alert" className="text-sm">
        {access.error.message}
      </p>
    );
  }
  if (access.data === null) {
    return (
      <p role="alert" className="text-sm">
        Your session expired.{" "}
        <Link href="/login?next=%2Ftasks" className="underline">
          Sign in again
        </Link>
      </p>
    );
  }
  if (!hasGrant(access.data, "task.read")) {
    return <p role="alert">You do not have access to tasks.</p>;
  }
  return <LoadedTaskDetails taskId={taskId} access={access.data} />;
}

function LoadedTaskDetails({
  taskId,
  access,
}: {
  taskId: string;
  access: CurrentAccess;
}) {
  const keys = taskKeys(access);
  const details = useQuery({
    queryKey: keys.detail(taskId),
    queryFn: ({ signal }) => gateway.getTaskCollaboration(taskId, signal),
    retry: false,
  });
  const history = useQuery({
    queryKey: [...keys.all, "review-history", taskId],
    queryFn: ({ signal }) => gateway.getTaskReviewHistory(taskId, signal),
    retry: false,
  });
  const subtasks = useQuery({
    queryKey: [...keys.all, "subtasks", taskId],
    queryFn: ({ signal }) =>
      gateway.listTasks({ parentTaskId: taskId, pageSize: 100 }, signal),
    retry: false,
  });
  const mutations = useTaskMutations(access);
  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (details.isPending) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Loading task…
      </p>
    );
  }
  if (details.isError || !details.data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>The task could not be loaded.</AlertTitle>
        <Button variant="outline" onClick={() => void details.refetch()}>
          Try again
        </Button>
      </Alert>
    );
  }

  const { task, comments, activity, files } = details.data;
  const viewerId = access.userId;
  const assignedToViewer = isAssignee(task, viewerId);
  const canEdit = creatorGatedFor(access, "task.update")(task);
  // Status moves follow the server's lifecycle table: only the moves valid
  // from the current status, and only for people allowed to move the task.
  const statusMoves = canActOnAssignedTask(access, "task.update_status")(task)
    ? ASSIGNEE_TRANSITION_TARGETS[task.status]
    : [];
  const canSubmit =
    task.status === "IN_PROGRESS" &&
    canActOnAssignedTask(access, "task.submit")(task);
  const designatedReviewer = task.reportTo?.id ?? task.createdBy?.id ?? null;
  const canReview =
    task.status === "UNDER_REVIEW" &&
    hasGrant(access, "task.review") &&
    !assignedToViewer &&
    designatedReviewer === viewerId;

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "That change was not saved. Try again.",
      );
    }
  }

  return (
    <article className="space-y-10">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono">
            {task.identifier}
          </Badge>
          <Badge variant="secondary">{TASK_STATUS_LABELS[task.status]}</Badge>
          <Badge variant="outline">
            {TASK_PRIORITY_LABELS[task.priority]} priority
          </Badge>
          <Badge variant="outline">{TASK_TYPE_LABELS[task.type]}</Badge>
          {task.reviewerUnresolved ? (
            <Badge variant="destructive">Reviewer needed</Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">
            {task.title}
          </h1>
          <div className="flex flex-wrap gap-2">
            {statusMoves.map((status) => (
              <Button
                key={status}
                variant="outline"
                onClick={() =>
                  void run(() =>
                    mutations.transition.mutateAsync({ id: task.id, status }),
                  )
                }
              >
                Move to {TASK_STATUS_LABELS[status]}
              </Button>
            ))}
            {canSubmit ? (
              <Button
                onClick={() =>
                  void run(() => mutations.submit.mutateAsync(task.id))
                }
              >
                Submit for review
              </Button>
            ) : null}
            {canEdit && !editing ? (
              <Button variant="outline" onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : null}
          </div>
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span>
            Assigned to{" "}
            <span className="text-foreground font-medium">
              {task.assignees.length > 0
                ? task.assignees.map((person) => personName(person)).join(", ")
                : "Nobody yet"}
            </span>
          </span>
          <span>
            Created by{" "}
            <span className="text-foreground font-medium">
              {task.createdBy ? personName(task.createdBy) : "Unknown"}
            </span>
          </span>
          <span>{scheduleLabel(task)}</span>
        </div>
        {task.parentTask ? (
          <p className="text-muted-foreground text-sm">
            Subtask of{" "}
            <Link
              href={`/tasks/${task.parentTask.id}` as Route}
              className="text-foreground underline underline-offset-4"
            >
              {task.parentTask.identifier} · {task.parentTask.title}
            </Link>
          </p>
        ) : null}
        {actionError ? (
          <p role="alert" className="text-destructive text-sm">
            {actionError}
          </p>
        ) : null}
      </header>

      {editing ? (
        <TaskEditForm
          task={task}
          busy={mutations.update.isPending}
          onCancel={() => setEditing(false)}
          onSave={(values) =>
            run(async () => {
              await mutations.update.mutateAsync({ id: task.id, ...values });
              setEditing(false);
            })
          }
        />
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Panel>
            <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
              Description
            </h2>
            <p className="text-sm whitespace-pre-line">
              {task.description ?? "No description was provided for this task."}
            </p>
          </Panel>

          <Panel>
            <ChecklistSection
              task={task}
              items={task.checklistItems}
              busy={mutations.addChecklistItem.isPending}
              actions={{
                canEditItems: canEdit || assignedToViewer,
                canToggleItems: canActOnAssignedTask(
                  access,
                  "task.update_progress",
                )(task),
                currentUserId: viewerId,
                canManageUnattributedItems: hasGrant(access, "task.update"),
                addItem: (description) =>
                  mutations.addChecklistItem.mutateAsync({
                    id: task.id,
                    description,
                  }),
                removeItem: (itemId) =>
                  mutations.removeChecklistItem.mutateAsync({
                    id: task.id,
                    itemId,
                  }),
                reorderItems: (orderedItemIds) =>
                  mutations.reorderChecklistItems.mutateAsync({
                    id: task.id,
                    orderedItemIds,
                  }),
                toggleItem: (itemId, completed) =>
                  mutations.toggleChecklistItem.mutateAsync({
                    id: task.id,
                    itemId,
                    completed,
                  }),
              }}
            />
          </Panel>

          {subtasks.isPending ? null : (
            <Panel>
              <SubtasksPanel
                subtasks={subtasks.data?.items ?? []}
                loading={subtasks.isPending}
                failed={subtasks.isError}
              />
            </Panel>
          )}

          {task.status === "UNDER_REVIEW" ? (
            <Panel>
              <ReviewPanel
                task={task}
                canReview={canReview}
                busy={mutations.review.isPending}
                onReview={(outcome, note) =>
                  run(() =>
                    mutations.review.mutateAsync({
                      id: task.id,
                      outcome,
                      note: note ?? "",
                    }),
                  )
                }
              />
            </Panel>
          ) : null}

          <Panel>
            <CommentsPanel
              comments={comments}
              canComment={hasGrant(access, "task.comment.create")}
              busy={mutations.comment.isPending}
              onAdd={(content) =>
                run(() =>
                  mutations.comment.mutateAsync({ id: task.id, content }),
                )
              }
            />
          </Panel>
        </div>

        <aside className="min-w-0 space-y-6">
          <TaskOverview task={task} />

          <Panel>
            <AssigneesPanel
              task={task}
              canManage={canManageAssigneesFor(access)(task)}
              busy={
                mutations.addAssignee.isPending ||
                mutations.removeAssignee.isPending
              }
              onAdd={(userId) =>
                run(() =>
                  mutations.addAssignee.mutateAsync({ id: task.id, userId }),
                )
              }
              onRemove={(userId) =>
                run(() =>
                  mutations.removeAssignee.mutateAsync({ id: task.id, userId }),
                )
              }
            />
          </Panel>

          {access.role === "SUPER_ADMIN" ? (
            <Panel>
              <ReviewerChangePanel
                task={task}
                busy={mutations.setReportTo.isPending}
                onChange={(reviewerId, reason) =>
                  run(() =>
                    mutations.setReportTo.mutateAsync({
                      id: task.id,
                      reviewerId,
                      reason,
                    }),
                  )
                }
              />
            </Panel>
          ) : null}

          <Panel>
            <FilesPanel
              files={files}
              taskId={task.id}
              canUpload={hasGrant(access, "task.attachment.create")}
              uploading={mutations.upload.isPending}
              onUpload={(file) =>
                run(() => mutations.upload.mutateAsync({ id: task.id, file }))
              }
            />
          </Panel>
        </aside>
      </div>

      <div className="space-y-6 border-t pt-10">
        <Panel>
          <ReviewHistory
            entries={history.data ?? []}
            loading={history.isPending}
            failed={history.isError}
          />
        </Panel>
        <Panel>
          <ActivityTimeline items={activity} />
        </Panel>
      </div>
    </article>
  );
}

function TaskOverview({ task }: { task: Task }) {
  return (
    <section
      aria-labelledby="details-heading"
      className="bg-card rounded-2xl border p-6"
    >
      <h2
        id="details-heading"
        className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase"
      >
        Details
      </h2>
      <dl className="text-sm">
        <Field label="Assigned to">
          {task.assignees.length > 0
            ? task.assignees.map((person) => personName(person)).join(", ")
            : "Nobody yet"}
        </Field>
        <Field label="Created by">
          {task.createdBy ? personName(task.createdBy) : "Unknown"}
        </Field>
        <Field label="Reviewer">
          {task.reportTo
            ? personName(task.reportTo)
            : task.reviewerUnresolved
              ? "Needs a Super Admin to name one"
              : "Not set (task from before reviewers)"}
        </Field>
        <Field label="Type">{TASK_TYPE_LABELS[task.type]}</Field>
        <Field label="Schedule">{scheduleLabel(task)}</Field>
        <Field label="Related event">
          {task.relatedEvent ? task.relatedEvent.name : "None"}
        </Field>
        <Field label="Related campaign">
          {task.relatedCampaign ? task.relatedCampaign.name : "None"}
        </Field>
      </dl>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-b py-2 last:border-b-0">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}

/** A bordered card that holds one section of the details page. */
function Panel({ children }: { children: ReactNode }) {
  return <div className="bg-card rounded-2xl border p-6">{children}</div>;
}

function TaskEditForm({
  task,
  busy,
  onCancel,
  onSave,
}: {
  task: Task;
  busy: boolean;
  onCancel: () => void;
  onSave: (values: {
    title: string;
    description: string | null;
    priority: TaskPriority;
    type: TaskType;
    startAt: string | null;
    dueAt: string | null;
    relatedEventId: string | null;
    relatedCampaignId: string | null;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [type, setType] = useState<TaskType>(task.type);
  const [startAt, setStartAt] = useState(
    task.startAt ? task.startAt.slice(0, 10) : "",
  );
  const [dueAt, setDueAt] = useState(task.dueAt ? task.dueAt.slice(0, 10) : "");
  const [relatedEventId, setRelatedEventId] = useState(
    task.relatedEvent?.id ?? "",
  );
  const [relatedCampaignId, setRelatedCampaignId] = useState(
    task.relatedCampaign?.id ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const events = useQuery({
    queryKey: ["task-edit-events"],
    queryFn: ({ signal }) =>
      listEvents({ pageSize: 100 }, signal).then((page) =>
        page.items.map((event) => ({ id: event.id, name: event.name })),
      ),
    retry: false,
    staleTime: 60_000,
  });
  const campaigns = useQuery({
    queryKey: ["task-edit-campaigns"],
    queryFn: ({ signal }) =>
      listCampaigns({ pageSize: 100 }, signal).then((page) =>
        page.items.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
        })),
      ),
    retry: false,
    staleTime: 60_000,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (title.trim() === "") return setError("Enter a task name.");
    if (startAt !== "" && dueAt !== "" && startAt > dueAt)
      return setError("The start date must be on or before the target date.");
    setError(null);
    void onSave({
      title: title.trim(),
      description: description.trim() === "" ? null : description.trim(),
      priority,
      type,
      startAt: startAt === "" ? null : `${startAt}T00:00:00.000Z`,
      dueAt: dueAt === "" ? null : `${dueAt}T00:00:00.000Z`,
      relatedEventId: relatedEventId === "" ? null : relatedEventId,
      relatedCampaignId: relatedCampaignId === "" ? null : relatedCampaignId,
    });
  }

  return (
    <form
      aria-label="Edit task"
      className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2"
      onSubmit={submit}
      noValidate
    >
      {error ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-2">
          {error}
        </p>
      ) : null}
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="edit-task-title">Task name *</Label>
        <Input
          id="edit-task-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="edit-task-description">Description</Label>
        <Textarea
          id="edit-task-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-task-priority">Priority</Label>
        <Select
          value={priority}
          onValueChange={(value) => setPriority(value as TaskPriority)}
        >
          <SelectTrigger id="edit-task-priority" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((value) => (
              <SelectItem key={value} value={value}>
                {TASK_PRIORITY_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-task-type">Task type</Label>
        <Select
          value={type}
          onValueChange={(value) => setType(value as TaskType)}
        >
          <SelectTrigger id="edit-task-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TASK_TYPES.map((value) => (
              <SelectItem key={value} value={value}>
                {TASK_TYPE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-task-start">Start date</Label>
        <Input
          id="edit-task-start"
          type="date"
          value={startAt}
          onChange={(event) => setStartAt(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-task-due">Target date</Label>
        <Input
          id="edit-task-due"
          type="date"
          value={dueAt}
          onChange={(event) => setDueAt(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-task-event">Related event</Label>
        <Select
          value={relatedEventId || NO_RELATED}
          onValueChange={(value) =>
            setRelatedEventId(value === NO_RELATED ? "" : value)
          }
        >
          <SelectTrigger id="edit-task-event" className="w-full">
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_RELATED}>None</SelectItem>
            {(events.data ?? []).map((event) => (
              <SelectItem key={event.id} value={event.id}>
                {event.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-task-campaign">Related campaign</Label>
        <Select
          value={relatedCampaignId || NO_RELATED}
          onValueChange={(value) =>
            setRelatedCampaignId(value === NO_RELATED ? "" : value)
          }
        >
          <SelectTrigger id="edit-task-campaign" className="w-full">
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_RELATED}>None</SelectItem>
            {(campaigns.data ?? []).map((campaign) => (
              <SelectItem key={campaign.id} value={campaign.id}>
                {campaign.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={busy}>
          Save changes
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ReviewPanel({
  task,
  canReview,
  busy,
  onReview,
}: {
  task: Task;
  canReview: boolean;
  busy: boolean;
  onReview: (
    outcome: "APPROVED" | "CHANGES_REQUESTED",
    note?: string,
  ) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  if (task.status !== "UNDER_REVIEW") return null;
  if (!canReview) {
    return (
      <section aria-labelledby="review-heading" className="space-y-2">
        <h2 id="review-heading" className="text-sm font-medium">
          Review
        </h2>
        <p className="text-muted-foreground text-sm">
          {task.reviewerUnresolved
            ? "This task needs a reviewer before it can be approved. A Super Admin can name one."
            : `Awaiting review by ${task.reportTo ? personName(task.reportTo) : "the designated reviewer"}.`}
        </p>
      </section>
    );
  }
  return (
    <section aria-labelledby="review-heading" className="space-y-3">
      <h2 id="review-heading" className="text-sm font-medium">
        Review
      </h2>
      <Label htmlFor="review-note">
        Feedback (required to request changes)
      </Label>
      <Textarea
        id="review-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void onReview("APPROVED")}>
          Approve
        </Button>
        <Button
          variant="outline"
          disabled={busy || note.trim() === ""}
          onClick={() => void onReview("CHANGES_REQUESTED", note.trim())}
        >
          Request changes
        </Button>
      </div>
    </section>
  );
}

function SubtasksPanel({
  subtasks,
  loading,
  failed,
}: {
  subtasks: readonly Task[];
  loading: boolean;
  failed: boolean;
}) {
  if (loading) return null;
  return (
    <section aria-labelledby="subtasks-heading" className="space-y-2">
      <h2 id="subtasks-heading" className="text-sm font-medium">
        Subtasks
      </h2>
      {failed ? (
        <p role="alert" className="text-sm">
          Subtasks could not be loaded.
        </p>
      ) : subtasks.length === 0 ? (
        <p className="text-muted-foreground text-sm">No subtasks yet.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {subtasks.map((subtask) => (
            <li
              key={subtask.id}
              className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
            >
              <Link
                href={`/tasks/${subtask.id}` as Route}
                className="underline underline-offset-4"
              >
                {subtask.identifier} · {subtask.title}
              </Link>
              <span className="text-muted-foreground">
                {TASK_STATUS_LABELS[subtask.status]} ·{" "}
                {subtask.progress === null
                  ? "Not tracked"
                  : `${subtask.progress}%`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReviewHistory({
  entries,
  loading,
  failed,
}: {
  entries: readonly TaskActivity[];
  loading: boolean;
  failed: boolean;
}) {
  return (
    <section aria-labelledby="history-heading" className="space-y-2">
      <h2 id="history-heading" className="text-sm font-medium">
        Review history
      </h2>
      {loading ? (
        <p role="status" className="text-muted-foreground text-sm">
          Loading review history…
        </p>
      ) : failed ? (
        <p role="alert" className="text-sm">
          Review history could not be loaded.
        </p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No submissions or reviews yet.
        </p>
      ) : (
        <ol className="space-y-2 text-sm">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-lg border p-3">
              <p>{activityLine(entry)}</p>
              <p className="text-muted-foreground">
                {dateLabel(entry.occurredAt)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function CommentsPanel({
  comments,
  canComment,
  busy,
  onAdd,
}: {
  comments: readonly TaskComment[];
  canComment: boolean;
  busy: boolean;
  onAdd: (content: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  return (
    <section aria-labelledby="comments-heading" className="space-y-3">
      <h2 id="comments-heading" className="text-sm font-medium">
        Comments
      </h2>
      {comments.length === 0 ? (
        <p className="text-muted-foreground text-sm">No comments yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-lg border p-3">
              <p className="font-medium">
                {comment.author ? personName(comment.author) : "Former user"}
              </p>
              <p className="whitespace-pre-line">{comment.content}</p>
            </li>
          ))}
        </ul>
      )}
      {canComment ? (
        <form
          aria-label="Add comment"
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim() === "") return;
            void onAdd(draft.trim()).then(() => setDraft(""));
          }}
        >
          <Label htmlFor="comment-draft">Add a comment</Label>
          <Textarea
            id="comment-draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" variant="outline" disabled={busy}>
            Post comment
          </Button>
        </form>
      ) : null}
    </section>
  );
}

function FilesPanel({
  files,
  taskId,
  canUpload,
  uploading,
  onUpload,
}: {
  files: readonly ManagedFile[];
  taskId: string;
  canUpload: boolean;
  uploading: boolean;
  onUpload: (file: File) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);

  function queueFiles(picked: File[]) {
    const problems = picked
      .map((file) => attachmentProblem(file))
      .filter((problem): problem is string => problem !== null);
    if (problems.length > 0) {
      setError(problems.join("; "));
      return;
    }
    setError(null);
    void (async () => {
      for (const file of picked) await onUpload(file);
    })();
  }

  return (
    <section aria-labelledby="files-heading" className="space-y-2">
      <h2 id="files-heading" className="text-sm font-medium">
        Attachments
      </h2>
      {canUpload ? (
        <AttachmentDropzone
          inputLabel="Choose files"
          disabled={uploading}
          onFiles={queueFiles}
        />
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {files.length === 0 ? (
        <p className="text-muted-foreground text-sm">No attachments.</p>
      ) : (
        <ul className="divide-y rounded-xl border text-sm">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-2 p-3"
            >
              <span>{file.filename}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void gateway
                    .getTaskFileDownloadGrant(taskId, file.id)
                    .then((grant) =>
                      window.open(grant.url, "_blank", "noopener"),
                    )
                    .catch(() =>
                      setError("The file could not be downloaded. Try again."),
                    )
                }
              >
                Download
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActivityTimeline({ items }: { items: readonly TaskActivity[] }) {
  return (
    <section aria-labelledby="activity-heading" className="space-y-5">
      <h2 id="activity-heading" className="text-sm font-medium">
        Activity
      </h2>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No activity recorded yet.
        </p>
      ) : (
        <ol className="space-y-5 border-l pl-5 text-sm">
          {items.map((item) => (
            <li key={item.id} className="relative">
              <span
                aria-hidden="true"
                className="bg-primary absolute top-1.5 -left-[21px] size-2 rounded-full"
              />
              <p>
                <span className="font-medium">
                  {item.actor ? personName(item.actor) : "System"}
                </span>{" "}
                {activityLine(item)}
              </p>
              <p className="text-muted-foreground">
                {dateLabel(item.occurredAt)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** A plain sentence for one recorded activity. Unknown types stay truthful. */
export function activityLine(item: TaskActivity): string {
  const details = (item.details ?? {}) as Record<string, unknown>;
  const text = (key: string) =>
    typeof details[key] === "string" ? (details[key] as string) : "";
  switch (item.type) {
    case "CREATED":
      return "created the task";
    case "UPDATED":
      return "updated the task";
    case "ASSIGNEE_ADDED":
      return "added an assignee";
    case "ASSIGNEE_REMOVED":
      return "removed an assignee";
    case "STATUS_CHANGED":
      return `changed the status${text("from") && text("to") ? ` from ${TASK_STATUS_LABELS[text("from") as keyof typeof TASK_STATUS_LABELS] ?? text("from")} to ${TASK_STATUS_LABELS[text("to") as keyof typeof TASK_STATUS_LABELS] ?? text("to")}` : ""}`;
    case "SUBMITTED_FOR_REVIEW":
      return "submitted the work for review";
    case "REVIEW_RECORDED": {
      const outcome =
        details.outcome === "APPROVED"
          ? "approved the work"
          : "requested changes";
      const note =
        typeof details.note === "string" && details.note
          ? `: "${details.note}"`
          : "";
      return `${outcome}${note}`;
    }
    case "REPORT_TO_CHANGED": {
      const reason =
        typeof details.reason === "string" && details.reason
          ? ` (${details.reason})`
          : "";
      return `changed the reviewer${reason}`;
    }
    case "COMMENT_ADDED":
      return "commented";
    case "ATTACHMENT_ADDED":
      return "attached a file";
    case "PROGRESS_UPDATED":
      return "updated the progress";
    case "CHECKLIST_ITEM_ADDED":
      return "added a checkpoint";
    case "CHECKLIST_ITEM_UPDATED":
      return "edited a checkpoint";
    case "CHECKLIST_ITEM_COMPLETED":
      return "completed a checkpoint";
    case "CHECKLIST_ITEM_REOPENED":
      return "reopened a checkpoint";
    case "CHECKLIST_ITEM_REMOVED":
      return "removed a checkpoint";
    case "CHECKLIST_ITEM_REORDERED":
      return "reordered the checkpoints";
    case "SUBTASK_ADDED":
      return "added a subtask";
    case "SUBTASK_UPDATED":
      return "updated a subtask";
    default:
      return String(item.type).toLowerCase().replaceAll("_", " ");
  }
}

/**
 * Super Admin's deliberate reviewer change. Ordinary editing and reassignment
 * never change the reviewer; this action does, with a required reason that is
 * recorded in the activity log and the audit trail.
 */
function ReviewerChangePanel({
  task,
  busy,
  onChange,
}: {
  task: Task;
  busy: boolean;
  onChange: (reviewerId: string, reason: string) => Promise<void>;
}) {
  const [reviewerId, setReviewerId] = useState("");
  const [reason, setReason] = useState("");
  const candidates = useQuery({
    queryKey: ["task-reviewer-candidates", task.departmentId],
    queryFn: ({ signal }) =>
      gateway.listEligibleRecipients(task.departmentId!, signal),
    enabled: task.departmentId !== null,
    retry: false,
    staleTime: 60_000,
  });
  const options = (candidates.data ?? []).filter(
    (person) => person.id !== task.reportTo?.id,
  );
  return (
    <section aria-labelledby="reviewer-change-heading" className="space-y-3">
      <h2 id="reviewer-change-heading" className="text-sm font-medium">
        Change reviewer
      </h2>
      <p className="text-sm">
        Current reviewer:{" "}
        <span className="font-medium">
          {task.reportTo ? personName(task.reportTo) : "Not set"}
        </span>
      </p>
      <div className="space-y-2">
        <Label htmlFor="new-reviewer">New reviewer</Label>
        <Select value={reviewerId} onValueChange={setReviewerId}>
          <SelectTrigger id="new-reviewer" className="w-full">
            <SelectValue placeholder="Choose a reviewer" />
          </SelectTrigger>
          <SelectContent>
            {options.map((person) => (
              <SelectItem key={person.id} value={person.id}>
                {personName(person)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="reviewer-reason">Reason (required)</Label>
        <Textarea
          id="reviewer-reason"
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      <Button
        variant="outline"
        disabled={busy || reviewerId === "" || reason.trim() === ""}
        onClick={() => void onChange(reviewerId, reason.trim())}
      >
        Change reviewer
      </Button>
    </section>
  );
}

/**
 * Who works on the task. Adding or removing assignees follows the same rules
 * as before: only people allowed to manage assignees see the controls, and the
 * server enforces the department and role limits.
 */
function AssigneesPanel({
  task,
  canManage,
  busy,
  onAdd,
  onRemove,
}: {
  task: Task;
  canManage: boolean;
  busy: boolean;
  onAdd: (userId: string) => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
}) {
  const assignedIds = new Set(task.assignees.map((person) => person.id));
  const candidates = useQuery({
    queryKey: ["task-assignee-candidates", task.departmentId],
    // A task in a department offers that department's staff; a task that is
    // only connected to a workspace offers the directory, as the dialog did.
    queryFn: async ({ signal }) =>
      task.departmentId
        ? gateway.listEligibleAssignees(task.departmentId, signal)
        : (await gateway.listAssignableTaskUsers(signal)).map((user) => ({
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
          })),
    enabled: canManage,
    retry: false,
    staleTime: 30_000,
  });
  const options = (candidates.data ?? []).filter(
    (person) => !assignedIds.has(person.id),
  );
  return (
    <section aria-labelledby="assignees-heading" className="space-y-3">
      <h2
        id="assignees-heading"
        className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
      >
        Assignees
      </h2>
      {task.assignees.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nobody is assigned yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {task.assignees.map((person) => (
            <li
              key={person.id}
              className="flex items-center justify-between gap-2"
            >
              <span className="font-medium">{personName(person)}</span>
              {canManage ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  aria-label={`Remove ${personName(person)}`}
                  onClick={() => void onRemove(person.id)}
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <div className="space-y-2">
          <Label htmlFor="add-assignee">Add assignee</Label>
          <Select
            value=""
            onValueChange={(value) => void onAdd(value)}
            disabled={busy || options.length === 0}
          >
            <SelectTrigger
              id="add-assignee"
              aria-label="Add assignee"
              className="w-full"
            >
              <SelectValue
                placeholder={
                  candidates.isPending
                    ? "Loading people…"
                    : options.length === 0
                      ? "No one else can be added"
                      : "Choose a person"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {options.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {personName(person)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </section>
  );
}
