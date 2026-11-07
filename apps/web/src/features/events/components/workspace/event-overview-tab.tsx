"use client";

import Link from "next/link";
import type { Route } from "next";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { listTasks } from "@/features/tasks/api/tasks-gateway";
import {
  dateLabel,
  personName as taskPersonName,
  taskPriorityLabel,
  taskStatusLabel,
  type Task,
} from "@/features/tasks/lib/tasks-types";

import {
  getEventBudgetSummary,
  getEventOverview,
  listEventActivity,
} from "../../api/events-gateway";
import { eventKeys } from "../../api/events-queries";
import {
  activityPhrase,
  compactAmount,
  readinessPercent,
  relativeTime,
} from "../../lib/event-workspace";
import { personName } from "../../lib/events-types";
import { EventMilestonesCard } from "./event-milestones-card";
import { useEventWorkspace } from "./event-workspace-shell";

const CARD = "border-border bg-card rounded-2xl border p-6 shadow-sm";
const ATTENTION_LIMIT = 5;

function Tile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="bg-card border-border rounded-2xl border p-5 shadow-sm">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </dd>
      <dd className="text-muted-foreground mt-2 text-sm">{note}</dd>
    </div>
  );
}

function KpiTiles() {
  const { event, access, abilities } = useEventWorkspace();
  const keys = eventKeys(access);
  const overview = useQuery({
    queryKey: keys.overview(event.id),
    queryFn: ({ signal }) => getEventOverview(event.id, signal),
    retry: false,
  });
  const budget = useQuery({
    queryKey: [...keys.budget(event.id), "summary"],
    queryFn: ({ signal }) => getEventBudgetSummary(event.id, signal),
    retry: false,
    enabled: abilities.canReadBudget,
  });

  if (overview.isPending) {
    return <p role="status">Loading the overview…</p>;
  }
  if (overview.isError) {
    return (
      <div role="alert" className="space-y-2">
        <p>{overview.error.message}</p>
        <Button variant="outline" onClick={() => void overview.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const { tasks, teams, milestones } = overview.data;
  const readiness = readinessPercent(tasks);
  const planned = budget.data?.plannedAmount ?? null;

  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        label="Readiness"
        value={readiness === null ? "—" : `${readiness}%`}
        note={
          milestones.total === 0
            ? "No milestones yet"
            : `${milestones.completed} of ${milestones.total} milestones complete`
        }
      />
      <Tile
        label="Tasks completed"
        value={`${tasks.completed} / ${tasks.total}`}
        note={`${tasks.awaitingReview} awaiting review`}
      />
      <Tile
        label="Teams involved"
        value={String(teams.count).padStart(2, "0")}
        note={`${teams.people} ${teams.people === 1 ? "person" : "people"} connected`}
      />
      {abilities.canReadBudget ? (
        <Tile
          label={`Budget${budget.data?.currency ? `, ${budget.data.currency}` : ""}`}
          value={planned === null ? "Not set" : compactAmount(planned)}
          note={
            budget.data
              ? `${compactAmount(budget.data.actualApproved)} approved spend`
              : "No budget set"
          }
        />
      ) : null}
    </dl>
  );
}

function ActivityCard() {
  const { event, access } = useEventWorkspace();
  const query = useQuery({
    queryKey: eventKeys(access).activity(event.id),
    queryFn: ({ signal }) => listEventActivity(event.id, signal),
    retry: false,
  });

  return (
    <section aria-labelledby="event-team-heading" className={CARD}>
      <h3 id="event-team-heading" className="mb-4 text-lg font-semibold">
        Event team
      </h3>
      {query.isPending ? (
        <p role="status" className="text-muted-foreground text-sm">
          Loading activity…
        </p>
      ) : query.isError ? (
        <div role="alert" className="space-y-2 text-sm">
          <p>{query.error.message}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : query.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">No activity yet.</p>
      ) : (
        <ul className="divide-border divide-y">
          {query.data.map((item) => (
            <li key={item.id} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm break-words">
                <span className="font-medium">
                  {item.actor ? personName(item.actor) : "Someone"}
                </span>{" "}
                <span className="text-muted-foreground">
                  {activityPhrase(item)}
                </span>
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {relativeTime(item.occurredAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function assigneeLabel(task: Task): string {
  const [first, ...rest] = task.assignees;
  if (!first) return "Unassigned";
  return rest.length > 0
    ? `${taskPersonName(first)} +${rest.length}`
    : taskPersonName(first);
}

function AttentionTasks() {
  const { event, access } = useEventWorkspace();
  const canReadTasks = access.grants.some(
    (grant) => grant.permissionKey === "task.read",
  );
  const query = useQuery({
    queryKey: eventKeys(access).attentionTasks(event.id),
    queryFn: ({ signal }) =>
      listTasks(
        {
          relatedEventId: event.id,
          needsAttention: true,
          sort: "DUE_AT",
          pageSize: ATTENTION_LIMIT,
        },
        signal,
      ),
    retry: false,
    enabled: canReadTasks,
  });

  if (!canReadTasks) return null;

  return (
    <section aria-labelledby="event-attention-heading" className={CARD}>
      <h3 id="event-attention-heading" className="mb-4 text-lg font-semibold">
        Tasks that need attention
      </h3>
      {query.isPending ? (
        <p role="status" className="text-muted-foreground text-sm">
          Loading tasks…
        </p>
      ) : query.isError ? (
        <div role="alert" className="space-y-2 text-sm">
          <p>{query.error.message}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : query.data.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No tasks need attention right now.
        </p>
      ) : (
        <div className="border-border overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="text-muted-foreground bg-muted/40 border-border border-b text-xs">
              <tr>
                {[
                  "Task",
                  "Priority",
                  "Status",
                  "Assignee",
                  "Due",
                  "Progress",
                ].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="px-4 py-3 font-medium"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {query.data.items.map((task) => (
                <tr key={task.id}>
                  <th scope="row" className="px-4 py-3 font-normal">
                    <Link
                      href={`/tasks/${task.id}` as Route}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {task.title}
                    </Link>
                  </th>
                  <td className="px-4 py-3">
                    <Badge variant="outline">
                      {taskPriorityLabel(task.priority)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">
                      {taskStatusLabel(task.status)}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {assigneeLabel(task)}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">
                    {task.dueAt ? dateLabel(task.dueAt) : "—"}
                  </td>
                  <td className="w-36 px-4 py-3">
                    <ProgressBar
                      percent={task.progress}
                      summary={
                        task.progress === null ? "—" : `${task.progress}%`
                      }
                      label={`Progress of ${task.title}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function EventOverviewTab() {
  return (
    <div className="space-y-6">
      <KpiTiles />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <EventMilestonesCard />
        <ActivityCard />
      </div>
      <AttentionTasks />
    </div>
  );
}
