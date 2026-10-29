"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";

import {
  taskProgressSummary,
  taskProgressTone,
} from "../lib/task-progress-tone";
import {
  personName,
  type Task,
  type TaskChecklistItem,
} from "../lib/tasks-types";

export interface ChecklistActions {
  /** `task.update`, already resolved to this one task: true only for this
   * task's own creator (or an organization-scoped actor) - a Manager who
   * is merely this task's assignee, not its creator, may never add a new
   * checkpoint, matching the same creator-gating as assignee management.
   * Moving or removing an *existing* item additionally requires owning it
   * - see `currentUserId`/`canManageUnattributedItems` below - so even a
   * creator-gated editor can never move or remove a Super Admin-created
   * checkpoint, only their own. The backend enforces edit and remove the
   * same way; move is a client-side ordering convenience over the same
   * whole-list reorder endpoint, so hiding it here is what actually keeps
   * a Manager from relocating someone else's item. */
  canEditItems: boolean;
  /** `task.update_progress` - the self-report side: toggle only, never
   * gated by item ownership. */
  canToggleItems: boolean;
  /** The viewer's own user id, to tell whether they authored a given item
   * - only an item's own creator may move or remove it, not merely anyone
   * who holds `task.update`. */
  currentUserId: string;
  /** True for an organization-scoped actor (Super Admin). Resolves the
   * fallback for a legacy item with no recorded creator: unattributed
   * items are only movable/removable by an organization-scoped actor,
   * never automatically opened up to a narrower-scoped Manager. */
  canManageUnattributedItems: boolean;
  addItem: (description: string) => Promise<unknown>;
  removeItem: (itemId: string) => Promise<unknown>;
  reorderItems: (orderedItemIds: string[]) => Promise<unknown>;
  toggleItem: (itemId: string, completed: boolean) => Promise<unknown>;
}

export function ChecklistSection({
  task,
  items,
  actions,
  busy,
}: {
  task: Pick<Task, "status" | "dueAt" | "progress"> & {
    subtaskSummary?: unknown;
  };
  items: readonly TaskChecklistItem[];
  actions: ChecklistActions;
  busy: boolean;
}) {
  const [draft, setDraft] = useState("");
  const hasSubtasks = Boolean(task.subtaskSummary);

  function isOwner(item: TaskChecklistItem): boolean {
    if (item.createdBy) return item.createdBy.id === actions.currentUserId;
    return actions.canManageUnattributedItems;
  }

  function move(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    const orderedItemIds = items.map((item) => item.id);
    const [moved] = orderedItemIds.splice(index, 1);
    orderedItemIds.splice(target, 0, moved!);
    void actions.reorderItems(orderedItemIds);
  }

  return (
    <section aria-labelledby="task-progress" className="space-y-3">
      <h2 id="task-progress" className="text-sm font-medium">
        Progress
      </h2>
      <ProgressBar
        percent={task.progress}
        summary={taskProgressSummary(task.progress)}
        tone={taskProgressTone(task)}
        label="Task progress"
      />
      {hasSubtasks ? (
        <p className="text-muted-foreground text-xs">
          This task has subtasks, so progress is the average of their own
          progress. Checklist items below are still trackable but do not feed
          this percentage.
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No checkpoints yet.</p>
      ) : (
        <ul aria-label="Checklist" className="space-y-2">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="border-border/60 rounded-lg border p-2"
            >
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={item.completed}
                  disabled={!actions.canToggleItems || busy}
                  onCheckedChange={(checked) =>
                    void actions.toggleItem(item.id, checked === true)
                  }
                  aria-label={`Mark "${item.description}" ${
                    item.completed ? "incomplete" : "complete"
                  }`}
                  className="mt-0.5"
                />
                <span
                  className={
                    item.completed
                      ? "text-muted-foreground min-w-0 flex-1 text-sm break-words line-through"
                      : "min-w-0 flex-1 text-sm break-words"
                  }
                >
                  {item.description}
                </span>
              </div>
              {item.completed && item.completedBy ? (
                <p className="text-muted-foreground mt-1 pl-8 text-xs">
                  Completed by {personName(item.completedBy)}
                </p>
              ) : null}
              {actions.canEditItems && !isOwner(item) && item.createdBy ? (
                <p
                  className="text-muted-foreground mt-1 pl-8 text-xs"
                  title={`Only ${personName(item.createdBy)} can edit, move, or remove this checkpoint.`}
                >
                  Added by {personName(item.createdBy)}
                </p>
              ) : null}
              {actions.canEditItems && isOwner(item) ? (
                <div className="mt-1 flex items-center gap-1 pl-7">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move "${item.description}" up`}
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ChevronUp aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move "${item.description}" down`}
                    disabled={busy || index === items.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ChevronDown aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove "${item.description}"`}
                    disabled={busy}
                    onClick={() => void actions.removeItem(item.id)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {actions.canEditItems ? (
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a checkpoint"
            aria-label="New checkpoint description"
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            size="sm"
            disabled={!draft.trim() || busy}
            onClick={async () => {
              await actions.addItem(draft.trim());
              setDraft("");
            }}
          >
            <Plus aria-hidden="true" data-icon="inline-start" />
            Add checkpoint
          </Button>
        </div>
      ) : null}
    </section>
  );
}
