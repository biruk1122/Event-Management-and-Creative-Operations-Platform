"use client";

import Link from "next/link";
import type { Route } from "next";
import { useQuery } from "@tanstack/react-query";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { listTasks } from "@/features/tasks/api/tasks-gateway";
import {
  dateLabel,
  taskPriorityLabel,
  taskStatusLabel,
  type Task,
} from "@/features/tasks/lib/tasks-types";

import { eventKeys } from "../../api/events-queries";
import { useEventWorkspace } from "./event-workspace-shell";

const CARD = "border-border bg-card rounded-2xl border p-6 shadow-sm";
const LIMIT = 50;

function TaskRow({ task }: { task: Task }) {
  return (
    <li className="border-border flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
      <div className="min-w-0">
        <Link
          href={`/tasks/${task.id}` as Route}
          className="font-semibold hover:underline"
        >
          {task.title}
        </Link>
        <p className="text-muted-foreground mt-1 text-sm">
          {task.dueAt ? `Due ${dateLabel(task.dueAt)}` : "No due date"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{taskPriorityLabel(task.priority)}</Badge>
        <Badge variant="outline">{taskStatusLabel(task.status)}</Badge>
      </div>
    </li>
  );
}

/** Tasks linked to this event. The tasks module applies each caller's visibility. */
export function EventTasksTab() {
  const { event, access } = useEventWorkspace();
  const keys = eventKeys(access);

  const tasks = useQuery({
    queryKey: keys.eventTasks(event.id),
    queryFn: ({ signal }) =>
      listTasks({ relatedEventId: event.id, pageSize: LIMIT }, signal),
  });

  return (
    <section className={CARD} aria-labelledby="event-tasks-heading">
      <div>
        <h3 id="event-tasks-heading" className="text-lg font-semibold">
          Tasks
        </h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Tasks linked to this event. You see the tasks your access allows.
        </p>
      </div>

      <div className="mt-6">
        {tasks.isPending ? (
          <p className="text-muted-foreground text-sm">Loading tasks…</p>
        ) : tasks.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Tasks could not be loaded. Try again.</AlertTitle>
          </Alert>
        ) : tasks.data.items.length === 0 ? (
          <div className="border-border rounded-xl border border-dashed p-8 text-center">
            <p className="font-medium">No tasks linked yet</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Tasks linked to this event appear here.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3">
            {tasks.data.items.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
